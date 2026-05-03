import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { applyMove, createEmptyGame, PLAYER_COLORS, hKey, vKey, bKey } from '../lib/gameLogic';
import { sfx } from '../lib/sound';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, Home } from 'lucide-react';

export default function Replay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'matches', id)).then(snap => {
      if (snap.exists()) setMatch({ id: snap.id, ...snap.data() });
    });
  }, [id]);

  useEffect(() => {
    if (!playing || !match) return;
    const totalSteps = (match.game.moves || []).length;
    if (step >= totalSteps) { setPlaying(false); return; }
    const t = setTimeout(() => {
      setStep(s => Math.min(totalSteps, s + 1));
      sfx.line();
    }, 600);
    return () => clearTimeout(t);
  }, [playing, step, match]);

  if (!match) return <div className="font-mono text-xs opacity-50 text-center py-20">LOADING…</div>;

  const moves = match.game.moves || [];
  const totalSteps = moves.length;

  // Build state at current step
  let game = createEmptyGame(match.rows, match.cols, match.players);
  for (let i = 0; i < step; i++) {
    const m = moves[i];
    const result = applyMove(game, m.type, m.r, m.c, m.by, match.players);
    if (!result.error) game = result.newGame;
  }

  const cell = Math.min(60, Math.max(28, 480 / Math.max(match.rows, match.cols)));
  const padding = 30;
  const w = match.cols * cell + padding * 2;
  const h = match.rows * cell + padding * 2;

  const playerColor = (id) => {
    const idx = match.players.indexOf(id);
    return idx === -1 ? null : PLAYER_COLORS[idx]?.hex;
  };
  const playerSoft = (id) => {
    const idx = match.players.indexOf(id);
    return idx === -1 ? null : PLAYER_COLORS[idx]?.soft;
  };
  const playerInitial = (id) => match.playerInfo?.[id]?.username?.[0]?.toUpperCase() || '·';

  return (
    <div className="fade-in space-y-6">
      <section>
        <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-2">Replay</div>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          {match.playerInfo?.[match.players[0]]?.username} vs {match.playerInfo?.[match.players[1]]?.username}
        </h1>
        <div className="font-mono text-xs tracking-widest uppercase opacity-50 mt-2">
          {match.rows} × {match.cols} · {moves.length} moves
        </div>
      </section>

      {/* Scoreboard */}
      <div className="grid grid-cols-2 gap-3 max-w-md">
        {match.players.map((pid, i) => {
          const info = match.playerInfo?.[pid] || { username: '?', avatar: '?' };
          return (
            <div key={pid} className="border p-3" style={{ borderColor: PLAYER_COLORS[i].hex }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-display text-lg">{info.avatar}</span>
                <span className="font-display text-sm truncate">{info.username}</span>
              </div>
              <div className="font-display text-2xl font-medium tabular-nums" style={{ color: PLAYER_COLORS[i].hex }}>
                {game.scores[pid] || 0}
              </div>
            </div>
          );
        })}
      </div>

      {/* Board */}
      <div className="flex justify-center">
        <svg width={w} height={h} style={{ maxWidth: '100%', height: 'auto' }}>
          {/* Boxes */}
          {Array.from({ length: match.rows }).map((_, r) =>
            Array.from({ length: match.cols }).map((_, c) => {
              const owner = game.boxes[bKey(r, c)];
              if (!owner) return null;
              const x = padding + c * cell;
              const y = padding + r * cell;
              return (
                <g key={`b-${r}-${c}`}>
                  <rect x={x + 2} y={y + 2} width={cell - 4} height={cell - 4} fill={playerSoft(owner)} />
                  <text x={x + cell / 2} y={y + cell / 2 + cell * 0.13} textAnchor="middle"
                        style={{ fontFamily: 'EB Garamond, serif', fontSize: cell * 0.4, fontWeight: 500, fill: playerColor(owner) }}>
                    {playerInitial(owner)}
                  </text>
                </g>
              );
            })
          )}
          {/* H lines */}
          {Array.from({ length: match.rows + 1 }).map((_, r) =>
            Array.from({ length: match.cols }).map((_, c) => {
              const owner = game.hLines[hKey(r, c)];
              if (!owner) return null;
              const x1 = padding + c * cell, x2 = padding + (c + 1) * cell, y = padding + r * cell;
              return (
                <line key={`h-${r}-${c}`} x1={x1 + 6} y1={y} x2={x2 - 6} y2={y}
                      stroke={playerColor(owner)} strokeWidth={3} strokeLinecap="round" />
              );
            })
          )}
          {/* V lines */}
          {Array.from({ length: match.rows }).map((_, r) =>
            Array.from({ length: match.cols + 1 }).map((_, c) => {
              const owner = game.vLines[vKey(r, c)];
              if (!owner) return null;
              const x = padding + c * cell, y1 = padding + r * cell, y2 = padding + (r + 1) * cell;
              return (
                <line key={`v-${r}-${c}`} x1={x} y1={y1 + 6} x2={x} y2={y2 - 6}
                      stroke={playerColor(owner)} strokeWidth={3} strokeLinecap="round" />
              );
            })
          )}
          {/* Dots — currentColor picks up theme */}
          {Array.from({ length: match.rows + 1 }).map((_, r) =>
            Array.from({ length: match.cols + 1 }).map((_, c) => (
              <circle key={`d-${r}-${c}`} cx={padding + c * cell} cy={padding + r * cell}
                      r={Math.max(2.5, cell / 18)} fill="currentColor" />
            ))
          )}
        </svg>
      </div>

      {/* Controls */}
      <div className="space-y-4 max-w-md mx-auto w-full">
        <div className="flex items-center gap-2">
          <button onClick={() => { setStep(0); setPlaying(false); }} className="p-2 hover:bg-black/5">
            <SkipBack size={16} />
          </button>
          <button onClick={() => setStep(s => Math.max(0, s - 1))} className="p-2 hover:bg-black/5">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setPlaying(!playing)} className="btn-primary flex-1">
            {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause' : 'Play'}
          </button>
          <button onClick={() => setStep(s => Math.min(totalSteps, s + 1))} className="p-2 hover:bg-black/5">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => { setStep(totalSteps); setPlaying(false); }} className="p-2 hover:bg-black/5">
            <SkipForward size={16} />
          </button>
        </div>
        <input type="range" min={0} max={totalSteps} value={step}
               onChange={e => { setStep(Number(e.target.value)); setPlaying(false); }}
               className="w-full" />
        <div className="flex justify-between font-mono text-[0.6rem] tracking-widest uppercase opacity-60">
          <span>Move {step} / {totalSteps}</span>
          <button onClick={() => navigate('/history')} className="hover:opacity-100"><Home size={12} className="inline" /> Back</button>
        </div>
      </div>
    </div>
  );
}
