import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { sfx } from '../lib/sound';
import { Eye, Users } from 'lucide-react';

export default function Lobby() {
  const { profile } = useAuth();
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, 'matches'),
      where('status', 'in', ['active', 'paused']),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  if (!profile) return null;

  const ongoing = matches.filter(m => !m.players.includes(profile.id));
  const yours = matches.filter(m => m.players.includes(profile.id));

  return (
    <div className="fade-in space-y-10">
      <section>
        <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-2">Live Lobby</div>
        <h1 className="font-display text-4xl font-medium tracking-tight">Ongoing Matches</h1>
      </section>

      {yours.length > 0 && (
        <section>
          <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-3">Your Matches</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {yours.map(m => <MatchCard key={m.id} match={m} youAreIn />)}
          </div>
        </section>
      )}

      <section>
        <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-3">
          Spectate ({ongoing.length})
        </div>
        {ongoing.length === 0 ? (
          <div className="text-center py-16 opacity-50 font-display italic">
            No matches in progress. Be the first.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ongoing.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function MatchCard({ match, youAreIn }) {
  const players = match.players.map(id => match.playerInfo?.[id] || { username: '?', avatar: '?' });
  const scores = match.players.map(id => match.game?.scores?.[id] || 0);
  const totalBoxes = match.rows * match.cols;
  const claimed = scores.reduce((a, b) => a + b, 0);
  const progress = totalBoxes > 0 ? Math.round((claimed / totalBoxes) * 100) : 0;
  const specCount = (match.spectators || []).length;
  const isPaused = match.status === 'paused';

  return (
    <Link to={`/match/${match.id}`} onClick={sfx.click} className="card block hover:bg-black/5 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="font-mono text-[0.6rem] tracking-widest uppercase opacity-60">
          {match.rows} × {match.cols} · {progress}%
        </div>
        <div className="flex items-center gap-1 font-mono text-[0.6rem] tracking-widest uppercase opacity-60">
          {isPaused ? (
            <span style={{ color: 'var(--ochre)' }}>● PAUSED</span>
          ) : (
            <><Eye size={10} /> {specCount}</>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {players.map((p, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg">{p.avatar}</span>
              <span className="font-display text-base truncate">{p.username}</span>
            </div>
            <span className="font-display text-xl font-medium tabular-nums">{scores[i]}</span>
          </div>
        ))}
      </div>
      {youAreIn && (
        <div className="mt-3 pt-3 border-t hairline font-mono text-[0.6rem] tracking-widest uppercase opacity-60">
          Your match · click to rejoin
        </div>
      )}
    </Link>
  );
}
