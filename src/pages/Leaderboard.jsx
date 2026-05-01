import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard } from '../lib/actions';
import { useAuth } from '../lib/AuthContext';
import { getRankFromElo } from '../lib/achievements';
import { sfx } from '../lib/sound';

export default function Leaderboard() {
  const { profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeaderboard(50).then(u => { setUsers(u); setLoading(false); });
  }, []);

  return (
    <div className="fade-in space-y-8">
      <section>
        <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-2">Top 50</div>
        <h1 className="font-display text-4xl font-medium tracking-tight">Leaderboard</h1>
      </section>

      {loading ? (
        <div className="font-mono text-xs opacity-50 text-center py-12">LOADING…</div>
      ) : (
        <section className="border hairline">
          {users.map((u, i) => {
            const rank = getRankFromElo(u.elo || 1000);
            const isMe = profile && u.id === profile.id;
            return (
              <Link
                to={`/profile/${u.username}`}
                onClick={sfx.click}
                key={u.id}
                className="flex items-center gap-4 px-4 py-3 border-b hairline last:border-b-0 hover:bg-black/5 transition-colors"
                style={{ background: isMe ? 'rgba(26,26,26,0.04)' : 'transparent' }}>
                <div className="font-mono text-xs tracking-widest opacity-50 tabular-nums shrink-0" style={{ width: 28 }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="font-display text-2xl shrink-0">{u.avatar || '◆'}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-base truncate">
                    {u.displayName || u.username}{isMe ? ' (you)' : ''}
                  </div>
                  <div className="font-mono text-[0.6rem] tracking-widest uppercase opacity-60" style={{ color: rank.color }}>
                    {rank.name}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-xl font-medium tabular-nums">{u.elo || 1000}</div>
                  <div className="font-mono text-[0.6rem] tracking-widest uppercase opacity-50">
                    {u.wins || 0}W · {u.losses || 0}L
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
