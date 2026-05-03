import { useEffect, useState } from 'react';
import { getReducedMotion } from '../lib/theme';

// Fires a one-shot confetti burst. Mount it conditionally (e.g. when
// the player wins). The component auto-removes itself after the
// animation finishes so it doesn't leak DOM nodes.
export default function Confetti({ pieceCount = 80, durationMs = 3500 }) {
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    if (getReducedMotion()) return; // Respect motion preference
    const colors = ['#B91C3C', '#B7791F', '#2F6B3F', '#1A1A1A', '#E25C7A', '#D9A85A'];
    const list = Array.from({ length: pieceCount }).map((_, i) => {
      const left = Math.random() * 100; // vw
      const dx = (Math.random() - 0.5) * 240; // px lateral drift
      const rot = (Math.random() * 1440) - 720; // deg
      const duration = 2200 + Math.random() * 1600; // ms
      const delay = Math.random() * 400; // ms
      const color = colors[i % colors.length];
      return { id: i, left, dx, rot, duration, delay, color };
    });
    setPieces(list);

    // Self-clean once the longest piece is done falling
    const t = setTimeout(() => setPieces([]), durationMs + 500);
    return () => clearTimeout(t);
  }, [pieceCount, durationMs]);

  if (pieces.length === 0) return null;
  return (
    <div className="confetti-root" aria-hidden="true">
      {pieces.map(p => (
        <span key={p.id} className="confetti-piece"
          style={{
            left: `${p.left}vw`,
            background: p.color,
            animationDuration: `${p.duration}ms`,
            animationDelay: `${p.delay}ms`,
            // Custom props consumed by the keyframes
            '--dx': `${p.dx}px`,
            '--rot': `${p.rot}deg`,
          }} />
      ))}
    </div>
  );
}
