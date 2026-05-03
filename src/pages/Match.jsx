import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import {
  watchMatch, makeMove, requestPause, respondToPause, resumeMatch, resignMatch,
  sendChatAs, joinAsSpectator, leaveSpectator, finalizeStats, requestRematch,
  forfeitOnTimeout,
} from '../lib/actions';
import { PLAYER_COLORS, hKey, vKey, bKey } from '../lib/gameLogic';
import { sfx } from '../lib/sound';
import { toast } from '../components/Notifications';
import { ACHIEVEMENTS } from '../lib/achievements';
import Confetti from '../components/Confetti';
import { isDisconnected } from '../lib/presence';
import { Pause, Play, Flag, Send, Eye, Trophy, RotateCcw, Home, Repeat, Clock, WifiOff } from 'lucide-react';

export default function Match() {
  const { id } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [finalized, setFinalized] = useState(false);
  const [achievementToasts, setAchievementToasts] = useState([]);
  const [now, setNow] = useState(Date.now()); // drives ticker
  const [opponentDoc, setOpponentDoc] = useState(null); // for disconnect detection
  const prevMoveCount = useRef(0);
  const prevStatus = useRef(null);
  const timeoutAttempted = useRef(null); // tracks last turnStartedAt we tried to forfeit on (debounces)
  const chatEndRef = useRef(null);

  // Subscribe to match
  useEffect(() => {
    if (!id) return;
    const unsub = watchMatch(id, (m) => {
      setMatch(m);
      if (!m) return;

      // Sound on new moves
      const newMoveCount = m.game?.moveCount || 0;
      if (prevMoveCount.current && newMoveCount > prevMoveCount.current) {
        const lastMove = m.game.moves?.[m.game.moves.length - 1];
        if (lastMove?.claimed > 0) sfx.claim();
        else sfx.line();
      }
      prevMoveCount.current = newMoveCount;

      // Sound on status change
      if (prevStatus.current && prevStatus.current !== m.status) {
        if (m.status === 'finished') {
          const isPlayer = profile && m.players.includes(profile.id);
          if (isPlayer) {
            const won = m.winner === profile.id;
            won ? sfx.win() : (m.winner === 'draw' ? sfx.notify() : sfx.loss());
          } else {
            sfx.notify();
          }
        }
      }
      prevStatus.current = m.status;
    });
    return () => unsub();
  }, [id, profile]);

  // Tick every 250ms while the match is in countdown or active. Drives both
  // the pre-game countdown and the per-turn timer UI. Stops when the match
  // is paused or finished.
  useEffect(() => {
    if (!match) return;
    if (match.status !== 'active') return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [match?.status]);

  // Subscribe to opponent's user doc for disconnect detection.
  // We only care when we're a player and the match is in play.
  useEffect(() => {
    if (!match || !profile) return;
    if (match.status !== 'active') return;
    if (!match.players.includes(profile.id)) return;
    const oppId = match.players.find(id => id !== profile.id);
    if (!oppId) return;
    const unsub = onSnapshot(doc(db, 'users', oppId), (snap) => {
      if (snap.exists()) setOpponentDoc(snap.data());
    });
    return () => unsub();
  }, [match?.status, match?.players, profile?.id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [match?.chat?.length]);

  // Join as spectator if not a player
  useEffect(() => {
    if (!match || !profile) return;
    if (match.players.includes(profile.id)) return;
    if ((match.spectators || []).some(s => s.id === profile.id)) return;
    joinAsSpectator(id, profile).catch(() => {});
    return () => { leaveSpectator(id, profile).catch(() => {}); };
    // eslint-disable-next-line
  }, [match?.id, profile?.id]);

  // Finalize stats when match ends
  useEffect(() => {
    if (!match || !profile || finalized) return;
    if (match.status !== 'finished') return;
    if (!match.players.includes(profile.id)) return;
    setFinalized(true);
    finalizeStats(id, profile).then((res) => {
      if (res?.newlyUnlocked?.length) {
        sfx.achievement();
        setAchievementToasts(res.newlyUnlocked);
      }
    }).catch(err => console.warn('Stats finalize failed:', err));
  }, [match?.status, profile, finalized, id]);

  // Auto-forfeit when MY turn timer expires. Honest path: the player whose
  // clock ran out concedes via their own client. The opponent's "Claim
  // Victory" button is the safety net for crashed/cheating clients.
  // We debounce on `turnStartedAt` so we don't spam the transaction.
  useEffect(() => {
    if (!match || !profile) return;
    if (match.status !== 'active') return;
    if (!match.players.includes(profile.id)) return;
    const isMine = match.players[match.game.currentPlayerIdx] === profile.id;
    if (!isMine) return;
    if (match.startsAtMs && Date.now() < match.startsAtMs) return; // pre-game
    const startedAtMs = match.turnStartedAt?.toMillis ? match.turnStartedAt.toMillis() : null;
    if (!startedAtMs) return;
    const timeoutMs = match.turnTimeoutMs || 60000;
    const expired = Date.now() > startedAtMs + timeoutMs;
    if (!expired) return;
    if (timeoutAttempted.current === startedAtMs) return; // already tried
    timeoutAttempted.current = startedAtMs;
    forfeitOnTimeout(id, profile).catch(err => {
      console.warn('auto-forfeit failed:', err);
    });
  }, [match?.turnStartedAt, match?.game?.currentPlayerIdx, match?.status, profile?.id, now, id]);

  if (!match) {
    return <div className="fade-in font-mono text-xs tracking-widest opacity-50 text-center py-20">LOADING…</div>;
  }
  if (!profile) return null;

  const isPlayer = match.players.includes(profile.id);
  const isSpectator = !isPlayer;
  const myIdx = match.players.indexOf(profile.id);
  const inCountdown = !!match.startsAtMs && now < match.startsAtMs && match.status === 'active';
  const isMyTurn = isPlayer
                   && match.game.currentPlayerIdx === myIdx
                   && match.status === 'active'
                   && !inCountdown;
  const opponentId = match.players.find(id => id !== profile.id);

  // Turn timer state. turnStartedAt is a Firestore Timestamp; .toMillis()
  // can briefly be null after a write before the listener gets the resolved
  // value. In that window we suppress the timer UI rather than show garbage.
  const turnStartedAtMs = match.turnStartedAt?.toMillis ? match.turnStartedAt.toMillis() : null;
  const turnTimeoutMs = match.turnTimeoutMs || 60000;
  const turnRemainingMs = (turnStartedAtMs && match.status === 'active' && !inCountdown)
    ? Math.max(0, turnStartedAtMs + turnTimeoutMs - now)
    : null;
  const turnExpiredWithGrace = turnStartedAtMs
    ? now > turnStartedAtMs + turnTimeoutMs + 5000
    : false;

  // Disconnect detection: opponent's lastSeen too old
  const opponentDisconnected = !!opponentDoc && isDisconnected(opponentDoc);
  const canClaimVictory = isPlayer
                          && !isMyTurn
                          && match.status === 'active'
                          && !inCountdown
                          && (turnExpiredWithGrace || opponentDisconnected);

  const handleMove = async (orient, r, c) => {
    if (!isMyTurn) return;
    try { await makeMove(id, orient, r, c, profile); }
    catch (err) { toast(err.message, 'error'); }
  };

  const handleSendChat = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    try {
      await sendChatAs(id, profile, chatInput, isSpectator);
      setChatInput('');
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleRequestPause = async () => {
    try { await requestPause(id, profile); toast('Pause requested', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };

  const handleRespondPause = async (accept) => {
    try { await respondToPause(id, profile, accept); }
    catch (err) { toast(err.message, 'error'); }
  };

  const handleResume = async () => {
    try { await resumeMatch(id, profile); }
    catch (err) { toast(err.message, 'error'); }
  };

  const handleResign = async () => {
    if (!confirm('Resign this match? Your opponent will win.')) return;
    try { await resignMatch(id, profile); }
    catch (err) { toast(err.message, 'error'); }
  };

  const handleClaimVictory = async () => {
    try {
      await forfeitOnTimeout(id, profile);
    } catch (err) { toast(err.message, 'error'); }
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  if (match.status === 'finished') {
    return <WinScreen match={match} profile={profile} achievementToasts={achievementToasts}
                      onHome={() => navigate('/')}
                      onReplay={() => navigate(`/replay/${id}`)} />;
  }

  // Pause concealment - hide board if paused
  const concealBoard = match.status === 'paused' && match.pauseConcealed;
  const lastMove = (match.game.moves || [])[(match.game.moves || []).length - 1];

  return (
    <div className="fade-in grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      {/* Game area */}
      <div className="space-y-6">
        {/* Pre-game countdown banner */}
        {inCountdown && (
          <div className="card flex items-center justify-between"
               style={{ background: 'var(--bg-soft)', borderColor: 'var(--hairline-strong)' }}>
            <div className="flex items-center gap-3">
              <div>
                <div className="font-display text-base">Starting…</div>
                <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-60">Get ready</div>
              </div>
            </div>
            <div className="font-display text-5xl font-medium tabular-nums">
              {Math.max(1, Math.ceil((match.startsAtMs - now) / 1000))}
            </div>
          </div>
        )}

        {/* Status banner */}
        {match.status === 'paused' && (
          <div className="card flex items-center justify-between" style={{ background: 'rgba(183,121,31,0.05)', borderColor: 'rgba(183,121,31,0.3)' }}>
            <div className="flex items-center gap-3">
              <Pause size={16} style={{ color: 'var(--ochre)' }} />
              <div>
                <div className="font-display text-base">Match Paused</div>
                <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-60">Board hidden to prevent strategizing</div>
              </div>
            </div>
            {isPlayer && (
              <button onClick={handleResume} className="btn-primary">
                <Play size={14} /> Resume
              </button>
            )}
          </div>
        )}

        {match.pauseRequest && match.status === 'active' && (
          <PauseRequestCard
            request={match.pauseRequest}
            currentUserId={profile.id}
            playerInfo={match.playerInfo}
            isPlayer={isPlayer}
            onRespond={handleRespondPause}
          />
        )}

        {/* Turn timer + disconnect / claim victory */}
        {turnRemainingMs !== null && (
          <TurnTimerBanner
            remainingMs={turnRemainingMs}
            timeoutMs={turnTimeoutMs}
            isMyTurn={isMyTurn}
            isPlayer={isPlayer}
            opponentDisconnected={opponentDisconnected}
            opponentName={match.playerInfo?.[opponentId]?.username}
            canClaimVictory={canClaimVictory}
            onClaimVictory={handleClaimVictory}
          />
        )}

        {/* Scoreboard */}
        <div className="grid grid-cols-2 gap-3">
          {match.players.map((pid, i) => {
            const info = match.playerInfo?.[pid] || { username: '?', avatar: '?' };
            const isCurrent = match.game.currentPlayerIdx === i && match.status === 'active' && !inCountdown;
            return (
              <div key={pid}
                className="border p-4 transition-all"
                style={{
                  borderColor: isCurrent ? PLAYER_COLORS[i].hex : 'var(--hairline)',
                  background: isCurrent ? PLAYER_COLORS[i].soft : 'transparent',
                }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-display text-xl shrink-0">{info.avatar}</span>
                    <span className="font-display text-base truncate">
                      {info.username}{pid === profile.id ? ' (you)' : ''}
                    </span>
                  </div>
                  {isCurrent && (
                    <span className="font-mono text-[0.55rem] tracking-widest opacity-60 shrink-0">● TURN</span>
                  )}
                </div>
                <div className="font-display text-3xl font-medium tabular-nums" style={{ color: PLAYER_COLORS[i].hex }}>
                  {match.game.scores[pid] || 0}
                </div>
              </div>
            );
          })}
        </div>

        {/* Board */}
        <div className="flex justify-center">
          {concealBoard ? (
            <ConcealedBoard rows={match.rows} cols={match.cols} />
          ) : (
            <Board game={match.game} players={match.players} playerInfo={match.playerInfo}
                   isMyTurn={isMyTurn} onPlay={handleMove} lastMove={lastMove} />
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="font-mono text-xs tracking-wide opacity-60">
            {isSpectator ? (
              <><Eye size={12} className="inline mr-1" /> Spectating · {match.spectators?.length || 0} watching</>
            ) : inCountdown ? (
              'Starting…'
            ) : isMyTurn ? (
              '◆ Your move'
            ) : match.status === 'paused' ? (
              'Paused'
            ) : (
              `Waiting for ${match.playerInfo?.[match.players[match.game.currentPlayerIdx]]?.username}…`
            )}
          </div>
          <div className="flex gap-2">
            {isPlayer && match.status === 'active' && !match.pauseRequest && !inCountdown && (
              <button onClick={handleRequestPause} className="btn-ghost">
                <Pause size={12} /> Pause
              </button>
            )}
            {isPlayer && match.status !== 'finished' && (
              <button onClick={handleResign} className="btn-danger">
                <Flag size={12} /> Resign
              </button>
            )}
            <button onClick={() => navigate('/lobby')} className="btn-ghost">
              <Home size={12} /> Lobby
            </button>
          </div>
        </div>
      </div>

      {/* Chat sidebar */}
      <div className="border hairline flex flex-col" style={{ minHeight: 400, maxHeight: 600 }}>
        <div className="px-4 py-3 border-b hairline flex items-center justify-between">
          <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-60">Chat</div>
          <div className="font-mono text-[0.6rem] tracking-widest uppercase opacity-50">
            <Eye size={10} className="inline mr-1" /> {match.spectators?.length || 0}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
          {(match.chat || []).length === 0 && (
            <div className="font-mono text-[0.65rem] opacity-40 text-center py-8 italic">
              No messages yet
            </div>
          )}
          {(match.chat || []).map(msg => {
            const isPlayerMsg = match.players.includes(msg.userId);
            const playerIdx = match.players.indexOf(msg.userId);
            const color = isPlayerMsg ? PLAYER_COLORS[playerIdx].hex : '#888';
            return (
              <div key={msg.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-base shrink-0">{msg.avatar}</span>
                  <span className="font-mono text-[0.65rem] tracking-wide font-medium" style={{ color }}>
                    {msg.username}
                  </span>
                  {msg.isSpectator && (
                    <span className="font-mono text-[0.55rem] tracking-widest uppercase opacity-50">spec</span>
                  )}
                </div>
                <div className="font-display text-base ml-7 leading-snug break-words">{msg.text}</div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSendChat} className="border-t hairline p-2 flex gap-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value.slice(0, 200))}
            placeholder="Say something…"
            className="flex-1 bg-transparent font-display text-base outline-none px-2"
          />
          <button type="submit" disabled={!chatInput.trim()} className="opacity-60 hover:opacity-100 disabled:opacity-20 px-2">
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────
function TurnTimerBanner({ remainingMs, timeoutMs, isMyTurn, isPlayer, opponentDisconnected, opponentName, canClaimVictory, onClaimVictory }) {
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = Math.max(0, Math.min(1, remainingMs / timeoutMs));
  // Color the timer by urgency
  const color = remainingMs < 10000 ? 'var(--crimson)'
              : remainingMs < 20000 ? 'var(--ochre)'
              : 'var(--ink)';

  // Show "Claim Victory" UI when opponent has timed out or appears to have
  // disconnected. Otherwise just show the standard countdown.
  if (canClaimVictory) {
    return (
      <div className="card flex items-center justify-between gap-3 flex-wrap"
           style={{ background: 'rgba(185,28,60,0.06)', borderColor: 'rgba(185,28,60,0.3)' }}>
        <div className="flex items-center gap-3">
          {opponentDisconnected
            ? <WifiOff size={16} style={{ color: 'var(--crimson)' }} />
            : <Clock size={16} style={{ color: 'var(--crimson)' }} />}
          <div>
            <div className="font-display text-base">
              {opponentDisconnected ? 'Opponent disconnected' : "Opponent's time is up"}
            </div>
            <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-60">
              {opponentName ? `${opponentName} ` : 'They '}haven't moved
            </div>
          </div>
        </div>
        <button onClick={onClaimVictory} className="btn-primary">
          <Trophy size={12} /> Claim Victory
        </button>
      </div>
    );
  }

  return (
    <div className="border hairline px-4 py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Clock size={14} style={{ color, opacity: 0.8 }} />
        <span className="font-mono text-[0.65rem] tracking-widest uppercase opacity-70">
          {!isPlayer ? 'Spectating'
            : isMyTurn ? 'Your turn'
            : opponentDisconnected ? `${opponentName || 'Opponent'} idle`
            : `${opponentName || 'Opponent'}'s turn`}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:block" style={{ width: 80, height: 4, background: 'var(--hairline)' }}>
          <div style={{ width: `${fraction * 100}%`, height: '100%', background: color, transition: 'width 250ms linear' }} />
        </div>
        <span className="font-mono text-sm tabular-nums" style={{ color }}>
          {seconds}s
        </span>
      </div>
    </div>
  );
}

function Board({ game, players, playerInfo, isMyTurn, onPlay, lastMove }) {
  const { rows, cols, hLines, vLines, boxes } = game;
  const cell = Math.min(70, Math.max(28, 520 / Math.max(rows, cols)));
  const dotR = Math.max(2.5, cell / 18);
  const padding = 30;
  const w = cols * cell + padding * 2;
  const h = rows * cell + padding * 2;

  const playerColor = (id) => {
    const idx = players.indexOf(id);
    return idx === -1 ? null : PLAYER_COLORS[idx]?.hex;
  };
  const playerSoft = (id) => {
    const idx = players.indexOf(id);
    return idx === -1 ? null : PLAYER_COLORS[idx]?.soft;
  };
  const playerInitial = (id) => {
    return playerInfo?.[id]?.username?.[0]?.toUpperCase() || '·';
  };

  const isLastMove = (orient, r, c) =>
    !!lastMove && lastMove.type === orient && lastMove.r === r && lastMove.c === c;

  return (
    <svg width={w} height={h} style={{ overflow: 'visible', maxWidth: '100%', height: 'auto' }}>
      {/* Filled boxes */}
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const owner = boxes[bKey(r, c)];
          if (!owner) return null;
          const x = padding + c * cell;
          const y = padding + r * cell;
          return (
            <g key={`b-${r}-${c}`} className="box-filled">
              <rect x={x + 2} y={y + 2} width={cell - 4} height={cell - 4} fill={playerSoft(owner)} />
              <text x={x + cell / 2} y={y + cell / 2 + cell * 0.13} textAnchor="middle"
                    style={{ fontFamily: 'EB Garamond, serif', fontSize: cell * 0.4, fontWeight: 500, fill: playerColor(owner) }}>
                {playerInitial(owner)}
              </text>
            </g>
          );
        })
      )}

      {/* Horizontal lines */}
      {Array.from({ length: rows + 1 }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const owner = hLines[hKey(r, c)];
          const drawn = owner != null;
          const x1 = padding + c * cell, x2 = padding + (c + 1) * cell, y = padding + r * cell;
          const drawnStroke = drawn ? playerColor(owner) : 'currentColor';
          const isLM = drawn && isLastMove('h', r, c);
          return (
            <g key={`h-${r}-${c}`}>
              <line x1={x1 + 6} y1={y} x2={x2 - 6} y2={y}
                stroke={drawnStroke}
                strokeWidth={drawn ? 3 : 2} strokeLinecap="round"
                style={{
                  opacity: drawn ? 1 : 0,
                  pointerEvents: drawn ? 'none' : 'auto',
                  color: drawnStroke, // for currentColor in filter
                }}
                className={`${drawn ? 'line-drawn' : ''} ${isLM ? 'last-move-line' : ''}`}
              />
              {!drawn && (
                <line x1={x1 + 6} y1={y} x2={x2 - 6} y2={y}
                  stroke="transparent" strokeWidth={Math.max(14, cell * 0.3)}
                  style={{ cursor: isMyTurn ? 'pointer' : 'default' }}
                  onClick={() => isMyTurn && onPlay('h', r, c)}
                  onMouseEnter={(e) => { if (isMyTurn) e.target.previousSibling.style.opacity = 0.25; }}
                  onMouseLeave={(e) => { if (isMyTurn) e.target.previousSibling.style.opacity = 0; }}
                />
              )}
            </g>
          );
        })
      )}

      {/* Vertical lines */}
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols + 1 }).map((_, c) => {
          const owner = vLines[vKey(r, c)];
          const drawn = owner != null;
          const x = padding + c * cell, y1 = padding + r * cell, y2 = padding + (r + 1) * cell;
          const drawnStroke = drawn ? playerColor(owner) : 'currentColor';
          const isLM = drawn && isLastMove('v', r, c);
          return (
            <g key={`v-${r}-${c}`}>
              <line x1={x} y1={y1 + 6} x2={x} y2={y2 - 6}
                stroke={drawnStroke}
                strokeWidth={drawn ? 3 : 2} strokeLinecap="round"
                style={{
                  opacity: drawn ? 1 : 0,
                  pointerEvents: drawn ? 'none' : 'auto',
                  color: drawnStroke,
                }}
                className={`${drawn ? 'line-drawn' : ''} ${isLM ? 'last-move-line' : ''}`}
              />
              {!drawn && (
                <line x1={x} y1={y1 + 6} x2={x} y2={y2 - 6}
                  stroke="transparent" strokeWidth={Math.max(14, cell * 0.3)}
                  style={{ cursor: isMyTurn ? 'pointer' : 'default' }}
                  onClick={() => isMyTurn && onPlay('v', r, c)}
                  onMouseEnter={(e) => { if (isMyTurn) e.target.previousSibling.style.opacity = 0.25; }}
                  onMouseLeave={(e) => { if (isMyTurn) e.target.previousSibling.style.opacity = 0; }}
                />
              )}
            </g>
          );
        })
      )}

      {/* Dots — use currentColor so they pick up the theme's --ink */}
      {Array.from({ length: rows + 1 }).map((_, r) =>
        Array.from({ length: cols + 1 }).map((_, c) => (
          <circle key={`d-${r}-${c}`}
            cx={padding + c * cell} cy={padding + r * cell}
            r={dotR} fill="currentColor" />
        ))
      )}
    </svg>
  );
}

function ConcealedBoard({ rows, cols }) {
  const cell = Math.min(70, Math.max(28, 520 / Math.max(rows, cols)));
  const padding = 30;
  const w = cols * cell + padding * 2;
  const h = rows * cell + padding * 2;
  return (
    <div className="relative" style={{ width: w, maxWidth: '100%', height: h }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} style={{ filter: 'blur(12px)', opacity: 0.4 }}>
        {Array.from({ length: rows + 1 }).map((_, r) =>
          Array.from({ length: cols + 1 }).map((_, c) => (
            <circle key={`d-${r}-${c}`} cx={padding + c * cell} cy={padding + r * cell} r={3} fill="currentColor" />
          ))
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Pause size={36} style={{ opacity: 0.4 }} />
        <div className="font-mono text-[0.7rem] tracking-widest uppercase opacity-50 mt-3">Board hidden</div>
      </div>
    </div>
  );
}

function PauseRequestCard({ request, currentUserId, playerInfo, isPlayer, onRespond }) {
  const requester = playerInfo?.[request.byId];
  const isMyRequest = request.byId === currentUserId;
  return (
    <div className="card" style={{ background: 'rgba(183,121,31,0.05)', borderColor: 'rgba(183,121,31,0.3)' }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Pause size={16} style={{ color: 'var(--ochre)' }} />
          <div>
            <div className="font-display text-base">
              {isMyRequest ? 'Pause request sent' : `${requester?.username || 'Player'} wants to pause`}
            </div>
            <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-60">
              {isMyRequest ? 'Waiting for opponent…' : 'Both players must agree'}
            </div>
          </div>
        </div>
        {isPlayer && !isMyRequest && (
          <div className="flex gap-2">
            <button onClick={() => onRespond(true)} className="btn-primary">Accept</button>
            <button onClick={() => onRespond(false)} className="btn-ghost">Decline</button>
          </div>
        )}
      </div>
    </div>
  );
}

function WinScreen({ match, profile, achievementToasts, onHome, onReplay }) {
  const players = match.players.map(id => match.playerInfo?.[id] || { username: '?', avatar: '?' });
  const scores = match.players.map(id => match.game.scores[id] || 0);
  const sorted = match.players.map((id, i) => ({ id, ...players[i], score: scores[i], idx: i }))
                              .sort((a, b) => b.score - a.score);
  const isPlayer = match.players.includes(profile.id);
  const isDraw = match.winner === 'draw';
  const youWon = match.winner === profile.id;
  const wasResigned = !!match.resignedBy;

  const [rematchState, setRematchState] = useState('idle'); // idle | sending | sent | error
  const handleRematch = async () => {
    if (rematchState === 'sending' || rematchState === 'sent') return;
    setRematchState('sending');
    try {
      await requestRematch(match, profile);
      setRematchState('sent');
      toast('Rematch invite sent', 'success');
      sfx.click();
    } catch (e) {
      setRematchState('idle');
      toast(e.message, 'error');
    }
  };

  let title;
  if (isDraw) title = 'A draw';
  else if (isPlayer && youWon) title = 'Victory';
  else if (isPlayer && !youWon) title = 'Defeat';
  else {
    const winner = match.players.find(id => id === match.winner);
    const winnerInfo = match.playerInfo?.[winner];
    title = `${winnerInfo?.username || '?'} wins`;
  }

  return (
    <div className="fade-in max-w-xl mx-auto text-center py-10">
      {/* Confetti only on personal victory */}
      {isPlayer && youWon && <Confetti />}

      <Trophy size={36} style={{ margin: '0 auto', opacity: 0.6, color: youWon ? 'var(--ochre)' : 'var(--ink)' }} />
      <h2 className="font-display mt-6 mb-2 leading-tight" style={{ fontSize: 'clamp(2.5rem, 7vw, 4rem)', fontWeight: 500 }}>
        {title}
      </h2>
      {wasResigned && (
        <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-4">
          By resignation
        </div>
      )}
      <div className="font-mono text-xs tracking-widest uppercase opacity-55 mb-12">Final score</div>

      <div className="space-y-2 max-w-sm mx-auto mb-8">
        {sorted.map(p => (
          <div key={p.id} className="flex items-center justify-between border hairline px-4 py-3"
               style={{ background: PLAYER_COLORS[p.idx].soft }}>
            <div className="flex items-center gap-3">
              <span className="font-display text-xl">{p.avatar}</span>
              <span className="font-display text-lg">{p.username}{p.id === profile.id ? ' (you)' : ''}</span>
            </div>
            <span className="font-display text-2xl font-medium tabular-nums" style={{ color: PLAYER_COLORS[p.idx].hex }}>
              {p.score}
            </span>
          </div>
        ))}
      </div>

      {/* Achievement unlocks */}
      {achievementToasts.length > 0 && (
        <div className="mb-8">
          <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-60 mb-3">
            ◆ Achievement{achievementToasts.length > 1 ? 's' : ''} Unlocked
          </div>
          <div className="space-y-2 max-w-sm mx-auto">
            {achievementToasts.map(id => {
              const a = ACHIEVEMENTS.find(x => x.id === id);
              if (!a) return null;
              return (
                <div key={id} className="card fade-in text-left" style={{ background: 'rgba(183,121,31,0.05)', borderColor: 'rgba(183,121,31,0.3)' }}>
                  <div className="font-display text-lg">{a.name}</div>
                  <div className="font-mono text-[0.65rem] tracking-wide opacity-70 mt-1">{a.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-3 justify-center flex-wrap">
        {isPlayer && (
          <button onClick={handleRematch} disabled={rematchState === 'sending' || rematchState === 'sent'}
                  className="btn-ghost">
            <Repeat size={14} />{' '}
            {rematchState === 'sent' ? 'Rematch sent'
              : rematchState === 'sending' ? 'Sending…'
              : 'Rematch'}
          </button>
        )}
        <button onClick={onReplay} className="btn-ghost"><RotateCcw size={14} /> Watch Replay</button>
        <button onClick={onHome} className="btn-primary"><Home size={14} /> Home</button>
      </div>
    </div>
  );
}
