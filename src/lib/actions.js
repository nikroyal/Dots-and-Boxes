import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, runTransaction,
  arrayUnion, arrayRemove, increment,
} from 'firebase/firestore';
import { db } from './firebase';
import { createEmptyGame, applyMove, computeElo, hKey, vKey } from './gameLogic';
import { checkUnlocks } from './achievements';

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

  // Create the match
  const playerIds = [inv.fromId, inv.toId];
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
    const playerIdx = m.players.indexOf(currentUser.id);
    if (playerIdx === -1) throw new Error('Not a player');
    if (m.game.currentPlayerIdx !== playerIdx) throw new Error('Not your turn');

    const result = applyMove(m.game, orientation, r, c, currentUser.id, m.players);
    if (result.error) throw new Error(result.error);

    const update = { game: result.newGame };

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
    finalizedMatches: arrayUnion(matchId),
  };

  // Check achievements with the projected stats
  const projectedStats = { ...u, ...newStats, friends: (u.friends || []).length };
  const newlyUnlocked = checkUnlocks(projectedStats, u.unlockedAchievements || []);
  if (newlyUnlocked.length > 0) {
    newStats.unlockedAchievements = arrayUnion(...newlyUnlocked);
  }

  // Save match history entry
  newStats.matchHistory = arrayUnion({
    matchId,
    opponent: m.playerInfo?.[oppId]?.username || 'unknown',
    opponentAvatar: m.playerInfo?.[oppId]?.avatar || '◆',
    myScore, oppScore,
    result,
    eloDelta: deltaA,
    rows: m.rows, cols: m.cols,
    finishedAt: Date.now(),
  });

  await updateDoc(userRef, newStats);
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

  const newReqs = (currentUser.friendRequests || []).filter(r => r.fromId !== fromId);
  await updateDoc(doc(db, 'users', currentUser.id), {
    friends: arrayUnion(fromId),
    friendRequests: newReqs,
  });
  await updateDoc(doc(db, 'users', fromId), {
    friends: arrayUnion(currentUser.id),
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
