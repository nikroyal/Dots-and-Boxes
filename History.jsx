import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { sfx } from '../lib/sound';

export default function History() {
  const { profile } = useAuth();
  if (!profile) return null;

  const history = [...(profile.matchHistory || [])].reverse();

  return (
    <div className="fade-in space-y-8">
      <section>
        <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-2">Past Matches</div>
        <h1 className="font-display text-4xl font-medium tracking-tight">History</h1>
      </section>

      {history.length === 0 ? (
        <div className="font-display italic opacity-50 text-center py-16">No matches played yet</div>
      ) : (
        <section className="border hairline">
          {history.map((h, i) => {
            const resultColor = h.result === 'win' ? 'var(--forest)' : h.result === 'loss' ? 'var(--crimson)' : 'var(--ochre)';
            const date = new Date(h.finishedAt).toLocaleDateString();
            return (
              <Link key={i} to={`/replay/${h.matchId}`} onClick={sfx.click}
                    className="flex items-center justify-between gap-4 px-4 py-3 border-b hairline last:border-b-0 hover:bg-black/5 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="font-mono text-[0.6rem] tracking-widest uppercase shrink-0" style={{ color: resultColor, width: 50 }}>
                    {h.result === 'win' ? 'WIN' : h.result === 'loss' ? 'LOSS' : 'DRAW'}
                  </div>
                  <span className="font-display text-2xl shrink-0">{h.opponentAvatar || '◆'}</span>
                  <div className="min-w-0">
                    <div className="font-display text-base truncate">vs {h.opponent}</div>
                    <div className="font-mono text-[0.6rem] tracking-widest uppercase opacity-60">
                      {h.rows}×{h.cols} · {date}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-lg font-medium tabular-nums">
                    {h.myScore} – {h.oppScore}
                  </div>
                  <div className="font-mono text-[0.65rem] tracking-widest tabular-nums" style={{ color: h.eloDelta >= 0 ? 'var(--forest)' : 'var(--crimson)' }}>
                    {h.eloDelta >= 0 ? '+' : ''}{h.eloDelta} ELO
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
