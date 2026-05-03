import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, runTransaction,
  arrayUnion, arrayRemove, increment,
} from 'firebase/firestore';
import { db } from './firebase';
import { createEmptyGame, applyMove, computeElo, hKey, vKey } from './gameLogic';
import { checkUnlocks } from './achievements';
import { recordActivity, ACTIVITY_TYPES } from './activity';

// Pre-game countdown duration (ms). Both clients use the same `startsAtMs`
// stored on the match document to render a synchronized 3..2..1 countdown.
const PREGAME_COUNTDOWN_MS = 3500;

// Per-turn timeout (ms). When a player's turn starts, `turnStartedAt` is
// stamped on the match doc with serverTimestamp(). If a player doesn't move
// within this window, either client can call forfeitOnTimeout to settle the
// match. Note: this is enforceable only against honest clients — a
// determined cheater can disable JS to avoid auto-forfeiting. For a casual
// game this is good enough; the opponent's "Claim Victory" button is the
// safety net for abandoned games.
const TURN_TIMEOUT_MS = 60 * 1000;

// ─── User lookups ─────────────────────────────────────────────────────────
export async function lookupUserByUsername(username) {
  const clean = username.toLowerCase().trim();
  const snap = await getDoc(doc(db, 'usernames', clean));
  if (!snap.exists()) return null;
  const { uid } = snap.data();
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) return null;
  return { id: uid, ...userSnap.data() };
}

// ─── Invites ──────────────────────────────────────────────────────────────
// invites collection: { fromId, fromUsername, toId, toUsername, rows, cols, status, createdAt, matchId? }
export async function sendInvite(fromUser, toUsername, rows, cols) {
  const target = await lookupUserByUsername(toUsername);
  if (!target) throw new Error('User not found');
  if (target.id === fromUser.id) throw new Error("You can't invite yourself");
  if ((target.blocked || []).includes(fromUser.id)) throw new Error('Cannot invite this user');

  const inv = await addDoc(collection(db, 'invites'), {
    fromId: fromUser.id,
    fromUsername: fromUser.username,
    fromAvatar: fromUser.avatar || '◆',
    fromElo: fromUser.elo || 1000,
    toId: target.id,
    toUsername: target.username,
    rows, cols,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return inv.id;
}

export async function acceptInvite(inviteId, currentUser) {
  const invRef = doc(db, 'invites', inviteId);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) throw new Error('Invite not found');
  const inv = invSnap.data();
  if (inv.toId !== currentUser.id) throw new Error('Not your invite');
  if (inv.status !== 'pending') throw new Error('Invite already handled');

  // Create the match. `startsAtMs` is a client-side wall-clock time both
  // players use to drive a synchronized pre-game countdown. We accept that
  // network latency may shift each player's perceived countdown by ~100ms
  // — fine for a 3-second UX, and `makeMove` enforces the gate server-side
  // (well, transaction-side) anyway.
  const playerIds = [inv.fromId, inv.toId];
  const startsAtMs = Date.now() + PREGAME_COUNTDOWN_MS;
  const matchRef = await addDoc(collection(db, 'matches'), {
    players: playerIds,
    playerInfo: {
      [inv.fromId]: { username: inv.fromUsername, avatar: inv.fromAvatar, elo: inv.fromElo },
      [inv.toId]:   { username: currentUser.username, avatar: currentUser.avatar || '◆', elo: currentUser.elo || 1000 },
    },
    rows: inv.rows,
    cols: inv.cols,
    game: createEmptyGame(inv.rows, inv.cols, playerIds),
    status: 'active', // active | paused | finished
    pauseRequest: null, // { byId, requestedAt }
    pauseConcealed: false, // when paused, hide board
    spectators: [],
    chat: [],
    winner: null,
    startsAtMs, // pre-game countdown target
    turnStartedAt: serverTimestamp(), // for per-turn timer
    turnTimeoutMs: TURN_TIMEOUT_MS,
    createdAt: serverTimestamp(),
    finishedAt: null,
  });

  await updateDoc(invRef, { status: 'accepted', matchId: matchRef.id });
  return matchRef.id;
}

export async function declineInvite(inviteId, currentUser) {
  const invRef = doc(db, 'invites', inviteId);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) return;
  if (invSnap.data().toId !== currentUser.id) throw new Error('Not your invite');
  await updateDoc(invRef, { status: 'declined' });
}

export async function cancelInvite(inviteId, currentUser) {
  const invRef = doc(db, 'invites', inviteId);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) return;
  if (invSnap.data().fromId !== currentUser.id) throw new Error('Not your invite');
  await deleteDoc(invRef);
}

// Mark an accepted invite as "consumed" so Dashboard's listener doesn't
// re-fire on it. Called after navigating to a match. Any user can clear
// their own outgoing invite — we use updateDoc against an existing doc so
// the rule allowing sender/recipient to update applies.
export async function consumeAcceptedInvite(inviteId, currentUser) {
  const invRef = doc(db, 'invites', inviteId);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) return;
  const inv = invSnap.data();
  if (inv.fromId !== currentUser.id && inv.toId !== currentUser.id) return;
  if (inv.status !== 'accepted') return;
  await updateDoc(invRef, { status: 'consumed' }).catch(() => {});
}

// ─── Quick Match ──────────────────────────────────────────────────────────
// Find an online opponent within ±200 ELO and send them an invite.
// Returns { ok: true, opponent } on success, or throws with a friendly
// "no players found" message.
export async function quickMatch(currentUser, rows = 5, cols = 5) {
  const myElo = currentUser.elo || 1000;
  const blockedByMe = currentUser.blocked || [];

  // Pull a sample of online users. We don't combine where+orderBy because
  // that requires a composite index — instead we sort client-side. We also
  // can't filter on "the target's blocked array doesn't contain me"
  // server-side, so we fetch candidates and filter in JS.
  const q = query(
    collection(db, 'users'),
    where('online', '==', true),
    limit(50)
  );
  const snap = await getDocs(q);
  const candidates = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u =>
      u.id !== currentUser.id
      && !blockedByMe.includes(u.id)
      && !(u.blocked || []).includes(currentUser.id)
      && Math.abs((u.elo || 1000) - myElo) <= 200
    );

  if (candidates.length === 0) {
    throw new Error('No players online right now — try again in a minute');
  }

  // Pick the closest by ELO; tie-break randomly so two players hitting the
  // button at once don't always pair with the exact same person.
  candidates.sort((a, b) => {
    const da = Math.abs((a.elo || 1000) - myElo);
    const db_ = Math.abs((b.elo || 1000) - myElo);
    if (da !== db_) return da - db_;
    return Math.random() - 0.5;
  });
  const target = candidates[0];

  // Reuse the regular invite flow.
  await sendInvite(currentUser, target.username, rows, cols);
  return { ok: true, opponent: { username: target.username, elo: target.elo || 1000 } };
}

// ─── Rematch ──────────────────────────────────────────────────────────────
// After a finished match, send a fresh invite to the same opponent with the
// same board size. This is just a thin wrapper over sendInvite that pulls
// the relevant info off the finished match.
export async function requestRematch(match, currentUser) {
  if (!match || match.status !== 'finished') throw new Error('Match not finished');
  if (!match.players.includes(currentUser.id)) throw new Error('Not a player');
  const opponentId = match.players.find(id => id !== currentUser.id);
  const opponentUsername = match.playerInfo?.[opponentId]?.username;
  if (!opponentUsername) throw new Error('Opponent unknown');
  return sendInvite(currentUser, opponentUsername, match.rows, match.cols);
}

// ─── Matches ──────────────────────────────────────────────────────────────
export function watchMatch(matchId, callback) {
  return onSnapshot(doc(db, 'matches', matchId), (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
    else callback(null);
  });
}

export async function makeMove(matchId, orientation, r, c, currentUser) {
  await runTransaction(db, async (tx) => {
    const matchRef = doc(db, 'matches', matchId);
    const snap = await tx.get(matchRef);
    if (!snap.exists()) throw new Error('Match not found');
    const m = snap.data();
    if (m.status !== 'active') throw new Error('Game not active');

    // Pre-game countdown gate. We use the client's clock here, but since
    // `startsAtMs` was set ~3.5s in the future at match creation, this
    // window closes naturally for both players within a small skew.
    if (m.startsAtMs && Date.now() < m.startsAtMs) {
      throw new Error('Game starting…');
    }

    const playerIdx = m.players.indexOf(currentUser.id);
    if (playerIdx === -1) throw new Error('Not a player');
    if (m.game.currentPlayerIdx !== playerIdx) throw new Error('Not your turn');

    const result = applyMove(m.game, orientation, r, c, currentUser.id, m.players);
    if (result.error) throw new Error(result.error);

    const update = { game: result.newGame };

    // Reset the turn timer whenever the active player changes. (When the
    // mover claimed a box and gets another turn, we don't reset — they
    // continue under the original timer's clock to avoid stalling games.)
    const turnAdvanced = result.newGame.currentPlayerIdx !== m.game.currentPlayerIdx;
    if (turnAdvanced && !result.finished) {
      update.turnStartedAt = serverTimestamp();
    }

    if (result.finished) {
      update.status = 'finished';
      update.finishedAt = serverTimestamp();
      const winnerId = result.winnerIdx === -1 ? 'draw' : m.players[result.winnerIdx];
      update.winner = winnerId;
    }

    tx.update(matchRef, update);
  });
}

export async function requestPause(matchId, currentUser) {
  const matchRef = doc(db, 'matches', matchId);
  const snap = await getDoc(matchRef);
  if (!snap.exists()) throw new Error('Match not found');
  const m = snap.data();
  if (!m.players.includes(currentUser.id)) throw new Error('Not a player');
  if (m.status !== 'active') throw new Error('Game not active');
  if (m.pauseRequest) throw new Error('Pause already requested');
  await updateDoc(matchRef, {
    pauseRequest: { byId: currentUser.id, requestedAt: Date.now() },
  });
}

export async function respondToPause(matchId, currentUser, accept) {
  const matchRef = doc(db, 'matches', matchId);
  const snap = await getDoc(matchRef);
  if (!snap.exists()) throw new Error('Match not found');
  const m = snap.data();
  if (!m.players.includes(currentUser.id)) throw new Error('Not a player');
  if (!m.pauseRequest || m.pauseRequest.byId === currentUser.id)
    throw new Error('Nothing to respond to');

  if (accept) {
    await updateDoc(matchRef, {
      status: 'paused',
      pauseRequest: null,
      pauseConcealed: true, // hide the board to prevent strategizing
    });
  } else {
    await updateDoc(matchRef, { pauseRequest: null });
  }
}

export async function resumeMatch(matchId, currentUser) {
  const matchRef = doc(db, 'matches', matchId);
  const snap = await getDoc(matchRef);
  if (!snap.exists()) throw new Error('Match not found');
  const m = snap.data();
  if (!m.players.includes(currentUser.id)) throw new Error('Not a player');
  if (m.status !== 'paused') throw new Error('Not paused');
  // Either player can resume
  await updateDoc(matchRef, {
    status: 'active',
    pauseConcealed: false,
  });
}

export async function resignMatch(matchId, currentUser) {
  const matchRef = doc(db, 'matches', matchId);
  const snap = await getDoc(matchRef);
  if (!snap.exists()) return;
  const m = snap.data();
  if (!m.players.includes(currentUser.id)) return;
  if (m.status === 'finished') return;
  const otherPlayerId = m.players.find(id => id !== currentUser.id);
  await updateDoc(matchRef, {
    status: 'finished',
    winner: otherPlayerId,
    resignedBy: currentUser.id,
    finishedAt: serverTimestamp(),
  });
}

// Settle a match where the active player has run out of time. Either client
// (the timed-out player auto-forfeiting, or their opponent claiming victory)
// can call this. Idempotent — the transaction re-checks the timer and bails
// out if someone else already settled it. This also handles disconnect
// claims: if the opponent's `lastSeen` is stale, the present player can
// claim the win the same way.
export async function forfeitOnTimeout(matchId, currentUser) {
  const matchRef = doc(db, 'matches', matchId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(matchRef);
    if (!snap.exists()) throw new Error('Match not found');
    const m = snap.data();
    if (m.status !== 'active') return; // already over
    if (!m.players.includes(currentUser.id)) throw new Error('Not a player');

    // The player whose turn it currently is, is the loser on timeout.
    const loserIdx = m.game.currentPlayerIdx;
    const loserId = m.players[loserIdx];
    const winnerId = m.players.find(id => id !== loserId);

    // Verify the timer has actually expired (within a 5s grace window so
    // we don't punish slightly-skewed clocks). turnStartedAt is a
    // serverTimestamp; toMillis() can be null briefly between write and
    // resolution, in which case we conservatively skip.
    const startedAtMs = m.turnStartedAt?.toMillis ? m.turnStartedAt.toMillis() : null;
    if (!startedAtMs) return;
    const timeoutMs = m.turnTimeoutMs || 60000;
    const expired = Date.now() - startedAtMs > timeoutMs + 5000;
    if (!expired) return;

    tx.update(matchRef, {
      status: 'finished',
      winner: winnerId,
      timedOut: loserId,
      finishedAt: serverTimestamp(),
    });
  });
}

// ─── Chat ─────────────────────────────────────────────────────────────────
export async function sendChat(matchId, currentUser, text) {
  const trimmed = text.trim().slice(0, 200);
  if (!trimmed) return;
  const matchRef = doc(db, 'matches', matchId);
  await updateDoc(matchRef, {
    chat: arrayUnion({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: currentUser.id,
      username: currentUser.username,
      avatar: currentUser.avatar || '◆',
      text: trimmed,
      ts: Date.now(),
      isSpectator: false, // set by caller if needed
    }),
  });
}

export async function sendChatAs(matchId, currentUser, text, isSpectator) {
  const trimmed = text.trim().slice(0, 200);
  if (!trimmed) return;
  const matchRef = doc(db, 'matches', matchId);
  await updateDoc(matchRef, {
    chat: arrayUnion({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: currentUser.id,
      username: currentUser.username,
      avatar: currentUser.avatar || '◆',
      text: trimmed,
      ts: Date.now(),
      isSpectator,
    }),
  });
}

// ─── Spectating ───────────────────────────────────────────────────────────
export async function joinAsSpectator(matchId, currentUser) {
  const matchRef = doc(db, 'matches', matchId);
  const snap = await getDoc(matchRef);
  if (!snap.exists()) throw new Error('Match not found');
  const m = snap.data();
  if (m.players.includes(currentUser.id)) return; // already a player
  await updateDoc(matchRef, {
    spectators: arrayUnion({
      id: currentUser.id,
      username: currentUser.username,
      avatar: currentUser.avatar || '◆',
    }),
  });
}

export async function leaveSpectator(matchId, currentUser) {
  const matchRef = doc(db, 'matches', matchId);
  const snap = await getDoc(matchRef);
  if (!snap.exists()) return;
  const m = snap.data();
  const newSpecs = (m.spectators || []).filter(s => s.id !== currentUser.id);
  await updateDoc(matchRef, { spectators: newSpecs });
}

// ─── Stats finalization (called when match finishes) ──────────────────────
export async function finalizeStats(matchId, currentUser) {
  // Idempotent: check if already finalized for this user
  const matchRef = doc(db, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) return;
  const m = matchSnap.data();
  if (m.status !== 'finished') return;
  if (!m.players.includes(currentUser.id)) return;

  const userRef = doc(db, 'users', currentUser.id);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;
  const u = userSnap.data();

  // Track which matches we've finalized for this user
  const finalized = u.finalizedMatches || [];
  if (finalized.includes(matchId)) return;

  const playerIds = m.players;
  const myIdx = playerIds.indexOf(currentUser.id);
  const oppId = playerIds[1 - myIdx];
  const myScore = m.game.scores[currentUser.id] || 0;
  const oppScore = m.game.scores[oppId] || 0;

  let result;
  if (m.winner === 'draw') result = 'draw';
  else if (m.winner === currentUser.id) result = 'win';
  else result = 'loss';

  // Compute ELO
  const myElo = u.elo || 1000;
  const oppElo = m.playerInfo?.[oppId]?.elo || 1000;
  let scoreA = result === 'win' ? 1 : (result === 'draw' ? 0.5 : 0);
  const { newA, deltaA } = computeElo(myElo, oppElo, scoreA);

  // Biggest chain on this match for me
  let myBiggestChain = 0;
  for (const mv of m.game.moves || []) {
    if (mv.by === currentUser.id && mv.claimed > myBiggestChain) myBiggestChain = mv.claimed;
  }

  // Perfect win = won + opponent got 0 boxes
  const perfectWin = result === 'win' && oppScore === 0;
  const bigBoardWin = result === 'win' && (m.rows >= 10 || m.cols >= 10);
  // Comeback: was behind by 5+ at some point and won
  let comebackWin = false;
  if (result === 'win' && m.game.moves) {
    let myRunning = 0, oppRunning = 0, wasBehind5 = false;
    for (const mv of m.game.moves) {
      if (mv.by === currentUser.id) myRunning += mv.claimed;
      else oppRunning += mv.claimed;
      if (oppRunning - myRunning >= 5) wasBehind5 = true;
    }
    comebackWin = wasBehind5;
  }

  const duration = m.finishedAt && m.createdAt
    ? (m.finishedAt.toMillis?.() || Date.now()) - (m.createdAt.toMillis?.() || Date.now())
    : null;
  const fastestWin = result === 'win' && duration
    ? Math.min(u.fastestWin || Infinity, duration)
    : (u.fastestWin || null);

  const newWinStreak = result === 'win' ? (u.winStreak || 0) + 1 : 0;
  const bestWinStreak = Math.max(u.bestWinStreak || 0, newWinStreak);

  // Night Owl achievement: did the match finish between 00:00 and 04:00 local?
  // We use the local clock of the player who triggers finalize — fine because
  // each player only unlocks their own achievement.
  const nowHour = new Date().getHours();
  const playedAtMidnight = !!u.playedAtMidnight || (nowHour >= 0 && nowHour < 4);

  const newStats = {
    elo: Math.max(100, newA),
    gamesPlayed: (u.gamesPlayed || 0) + 1,
    wins: (u.wins || 0) + (result === 'win' ? 1 : 0),
    losses: (u.losses || 0) + (result === 'loss' ? 1 : 0),
    draws: (u.draws || 0) + (result === 'draw' ? 1 : 0),
    totalBoxes: (u.totalBoxes || 0) + myScore,
    biggestChain: Math.max(u.biggestChain || 0, myBiggestChain),
    perfectWins: (u.perfectWins || 0) + (perfectWin ? 1 : 0),
    bigBoardWins: (u.bigBoardWins || 0) + (bigBoardWin ? 1 : 0),
    comebackWins: (u.comebackWins || 0) + (comebackWin ? 1 : 0),
    winStreak: newWinStreak,
    bestWinStreak,
    fastestWin: fastestWin === Infinity ? null : fastestWin,
    playedAtMidnight,
    finalizedMatches: arrayUnion(matchId),
  };

  // Check achievements with the projected stats
  const projectedStats = { ...u, ...newStats, friends: (u.friends || []).length };
  const newlyUnlocked = checkUnlocks(projectedStats, u.unlockedAchievements || []);
  if (newlyUnlocked.length > 0) {
    newStats.unlockedAchievements = arrayUnion(...newlyUnlocked);
  }

  // Save match history entry. We include the post-match ELO so the stats
  // graph doesn't have to re-derive it.
  newStats.matchHistory = arrayUnion({
    matchId,
    opponent: m.playerInfo?.[oppId]?.username || 'unknown',
    opponentAvatar: m.playerInfo?.[oppId]?.avatar || '◆',
    myScore, oppScore,
    result,
    eloDelta: deltaA,
    eloAfter: Math.max(100, newA),
    rows: m.rows, cols: m.cols,
    finishedAt: Date.now(),
  });

  await updateDoc(userRef, newStats);

  // Record activity entries (best-effort, won't block on failure).
  // One match-result entry, plus one per achievement unlocked.
  const oppUsername = m.playerInfo?.[oppId]?.username || 'unknown';
  const activityType = result === 'win' ? ACTIVITY_TYPES.WIN
                     : result === 'loss' ? ACTIVITY_TYPES.LOSS
                     : ACTIVITY_TYPES.DRAW;
  recordActivity(currentUser, activityType, {
    matchId, opponent: oppUsername, myScore, oppScore, eloDelta: deltaA,
  });
  for (const ach of newlyUnlocked) {
    recordActivity(currentUser, ACTIVITY_TYPES.ACHIEVEMENT, { achievementId: ach });
  }

  return { newlyUnlocked, deltaA, result };
}

// ─── Friends / social ─────────────────────────────────────────────────────
export async function sendFriendRequest(currentUser, targetUsername) {
  const target = await lookupUserByUsername(targetUsername);
  if (!target) throw new Error('User not found');
  if (target.id === currentUser.id) throw new Error("You can't friend yourself");
  if ((currentUser.friends || []).includes(target.id)) throw new Error('Already friends');
  if ((target.blocked || []).includes(currentUser.id)) throw new Error('Cannot send request');

  await updateDoc(doc(db, 'users', target.id), {
    friendRequests: arrayUnion({
      fromId: currentUser.id,
      fromUsername: currentUser.username,
      fromAvatar: currentUser.avatar || '◆',
      ts: Date.now(),
    }),
  });
}

export async function acceptFriendRequest(currentUser, fromId) {
  // Add to both users' friends list, remove from requests
  const fromUserSnap = await getDoc(doc(db, 'users', fromId));
  if (!fromUserSnap.exists()) throw new Error('User not found');
  const fromUser = fromUserSnap.data();

  const newReqs = (currentUser.friendRequests || []).filter(r => r.fromId !== fromId);
  await updateDoc(doc(db, 'users', currentUser.id), {
    friends: arrayUnion(fromId),
    friendRequests: newReqs,
  });
  await updateDoc(doc(db, 'users', fromId), {
    friends: arrayUnion(currentUser.id),
  });

  recordActivity(currentUser, ACTIVITY_TYPES.FRIEND_ADDED, {
    friendId: fromId,
    friendUsername: fromUser.username,
    friendAvatar: fromUser.avatar || '◆',
  });
}

export async function declineFriendRequest(currentUser, fromId) {
  const newReqs = (currentUser.friendRequests || []).filter(r => r.fromId !== fromId);
  await updateDoc(doc(db, 'users', currentUser.id), { friendRequests: newReqs });
}

export async function removeFriend(currentUser, friendId) {
  await updateDoc(doc(db, 'users', currentUser.id), {
    friends: arrayRemove(friendId),
  });
  await updateDoc(doc(db, 'users', friendId), {
    friends: arrayRemove(currentUser.id),
  });
}

export async function blockUser(currentUser, targetUsername) {
  const target = await lookupUserByUsername(targetUsername);
  if (!target) throw new Error('User not found');
  await updateDoc(doc(db, 'users', currentUser.id), {
    blocked: arrayUnion(target.id),
    friends: arrayRemove(target.id),
  });
}

export async function unblockUser(currentUser, targetId) {
  await updateDoc(doc(db, 'users', currentUser.id), {
    blocked: arrayRemove(targetId),
  });
}

// ─── Profile updates ──────────────────────────────────────────────────────
export async function updateProfile(currentUser, updates) {
  const allowed = ['avatar', 'title', 'bio', 'displayName'];
  const filtered = {};
  for (const k of allowed) if (k in updates) filtered[k] = updates[k];
  await updateDoc(doc(db, 'users', currentUser.id), filtered);
}

// ─── Leaderboard ──────────────────────────────────────────────────────────
export async function getLeaderboard(limitN = 50) {
  const q = query(collection(db, 'users'), orderBy('elo', 'desc'), limit(limitN));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
