// Pure-SVG ELO-over-time chart. Reads from a user's matchHistory array.
// No external charting library — keeps bundle size tiny.

export default function EloChart({ matchHistory = [], currentElo = 1000 }) {
  // Reconstruct the ELO trajectory: starting at 1000, applying eloDelta from
  // each entry in chronological order. (matchHistory is appended in order.)
  // For entries written by older versions that don't have eloAfter, we fall
  // back to running-sum reconstruction.
  const ordered = [...matchHistory].sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));
  if (ordered.length === 0) {
    return (
      <div className="font-mono text-xs opacity-50 text-center py-10 italic">
        No games played yet
      </div>
    );
  }

  const points = [];
  let running = 1000;
  for (const m of ordered) {
    if (typeof m.eloAfter === 'number') {
      running = m.eloAfter;
    } else {
      running = running + (m.eloDelta || 0);
    }
    points.push({ ts: m.finishedAt, elo: running, result: m.result });
  }
  // Append "current" snapshot at the end
  if (currentElo && (points.length === 0 || points[points.length - 1].elo !== currentElo)) {
    points.push({ ts: Date.now(), elo: currentElo, result: 'now' });
  }

  // Down-sample if huge (>100 points): keep first, last, and every Nth.
  const sampled = points.length > 100
    ? sample(points, 100)
    : points;

  const w = 600;
  const h = 180;
  const padX = 36;
  const padY = 18;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  const elos = sampled.map(p => p.elo);
  const minE = Math.min(...elos);
  const maxE = Math.max(...elos);
  const span = Math.max(1, maxE - minE);
  // Round to a sensible band so the y-axis labels read nicely
  const yLow = Math.floor(minE / 50) * 50;
  const yHigh = Math.ceil(maxE / 50) * 50;
  const ySpan = Math.max(50, yHigh - yLow);

  const xAt = i => padX + (sampled.length === 1 ? innerW / 2 : (i / (sampled.length - 1)) * innerW);
  const yAt = elo => padY + innerH - ((elo - yLow) / ySpan) * innerH;

  const linePath = sampled
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.elo).toFixed(1)}`)
    .join(' ');

  const last = sampled[sampled.length - 1];
  const first = sampled[0];
  const trend = last.elo - first.elo;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-60">ELO Over Time</div>
        <div className="font-mono text-[0.65rem] tracking-widest tabular-nums" style={{
          color: trend > 0 ? 'var(--forest)' : trend < 0 ? 'var(--crimson)' : 'currentColor'
        }}>
          {trend >= 0 ? '+' : ''}{trend} since first game
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block', height: 'auto', maxHeight: 220 }}
           role="img" aria-label="ELO over time chart">
        {/* y-axis bounds */}
        <text x={padX - 6} y={padY + 4} textAnchor="end"
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: 'currentColor', opacity: 0.5 }}>
          {yHigh}
        </text>
        <text x={padX - 6} y={padY + innerH + 4} textAnchor="end"
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: 'currentColor', opacity: 0.5 }}>
          {yLow}
        </text>
        {/* Baseline */}
        <line x1={padX} y1={padY + innerH} x2={padX + innerW} y2={padY + innerH}
              stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
        {/* The line itself */}
        <path d={linePath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* Per-point markers, color-coded by result */}
        {sampled.map((p, i) => {
          const fill =
            p.result === 'win'  ? 'var(--forest)' :
            p.result === 'loss' ? 'var(--crimson)' :
            p.result === 'draw' ? 'var(--ochre)' :
            'currentColor';
          return <circle key={i} cx={xAt(i)} cy={yAt(p.elo)} r="2.5" fill={fill} />;
        })}
        {/* Latest value label */}
        <text x={xAt(sampled.length - 1) - 4} y={yAt(last.elo) - 8} textAnchor="end"
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, fill: 'currentColor' }}>
          {last.elo}
        </text>
      </svg>
    </div>
  );
}

// Even-stride sample of an array down to about `target` points,
// preserving the first and last entries.
function sample(arr, target) {
  if (arr.length <= target) return arr;
  const stride = (arr.length - 1) / (target - 1);
  const out = [];
  for (let i = 0; i < target; i++) {
    const idx = Math.round(i * stride);
    out.push(arr[Math.min(arr.length - 1, idx)]);
  }
  return out;
}
