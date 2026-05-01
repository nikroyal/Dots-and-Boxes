import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { sendInvite, cancelInvite, acceptFriendRequest, declineFriendRequest } from '../lib/actions';
import { toast } from '../components/Notifications';
import { sfx } from '../lib/sound';
import { getRankFromElo, ACHIEVEMENTS } from '../lib/achievements';
import { Send, X, Trophy, Target, TrendingUp, Users } from 'lucide-react';

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [target, setTarget] = useState('');
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [sending, setSending] = useState(false);
  const [outgoingInvites, setOutgoingInvites] = useState([]);

  // Watch our outgoing pending invites
  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, 'invites'),
      where('fromId', '==', profile.id),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(q, (snap) => {
      setOutgoingInvites(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [profile]);

  // Watch our outgoing invites that get accepted -> auto-navigate
  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, 'invites'),
      where('fromId', '==', profile.id),
      where('status', '==', 'accepted')
    );
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added' || change.type === 'modified') {
          const inv = change.doc.data();
          if (inv.matchId) {
            sfx.notify();
            navigate(`/match/${inv.matchId}`);
          }
        }
      });
    });
    return () => unsub();
  }, [profile, navigate]);

  if (!profile) return null;
  const rank = getRankFromElo(profile.elo || 1000);
  const winRate = profile.gamesPlayed > 0
    ? Math.round((profile.wins / profile.gamesPlayed) * 100)
    : 0;
  const recentAchievements = (profile.unlockedAchievements || []).slice(-3).reverse();
  const friendRequests = profile.friendRequests || [];

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!target.trim()) return;
    setSending(true);
    try {
      await sendInvite(profile, target.trim(), rows, cols);
      toast(`Invite sent to ${target}`, 'success');
      setTarget('');
      sfx.click();
    } catch (err) {
      toast(err.message, 'error');
    }
    setSending(false);
  };

  return (
    <div className="fade-in space-y-10">
      {/* Hero stats */}
      <section>
        <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-2">Welcome back</div>
        <h1 className="font-display text-5xl font-medium tracking-tight leading-none">
          {profile.displayName || profile.username}
        </h1>
        <div className="mt-2 font-mono text-xs tracking-widest uppercase" style={{ color: rank.color }}>
          {rank.name} · {profile.elo || 1000} ELO
        </div>
      </section>

      {/* Stat cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Trophy size={14} />} label="Wins" value={profile.wins || 0} />
        <StatCard icon={<Target size={14} />} label="Games" value={profile.gamesPlayed || 0} />
        <StatCard icon={<TrendingUp size={14} />} label="Win Rate" value={`${winRate}%`} />
        <StatCard icon={<Users size={14} />} label="Friends" value={(profile.friends || []).length} />
      </section>

      {/* Quick play */}
      <section className="card">
        <h2 className="font-display text-2xl mb-1">New Match</h2>
        <p className="font-mono text-[0.7rem] tracking-widest uppercase opacity-50 mb-6">Challenge a player by username</p>
        <form onSubmit={handleInvite} className="space-y-6">
          <div>
            <label className="font-mono block mb-2 text-[0.65rem] tracking-widest uppercase opacity-55">Opponent</label>
            <input
              className="input-field"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="username"
            />
          </div>
          <div>
            <label className="font-mono block mb-3 text-[0.65rem] tracking-widest uppercase opacity-55">Board size</label>
            <div className="flex items-baseline gap-4">
              <SizeSelector value={rows} onChange={setRows} label="Rows" />
              <span className="font-display text-2xl opacity-30">×</span>
              <SizeSelector value={cols} onChange={setCols} label="Cols" />
            </div>
          </div>
          <button type="submit" disabled={sending} className="btn-primary">
            <Send size={14} /> Send Challenge
          </button>
        </form>
      </section>

      {/* Outgoing invites */}
      {outgoingInvites.length > 0 && (
        <section>
          <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-3">Pending Challenges</div>
          <div className="space-y-2">
            {outgoingInvites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between border hairline px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="pulse-soft" style={{ width: 6, height: 6, borderRadius: '50%', background: '#B7791F', display: 'inline-block' }} />
                  <span className="font-display text-base">Waiting for {inv.toUsername}…</span>
                  <span className="font-mono text-[0.65rem] tracking-widest opacity-50">{inv.rows}×{inv.cols}</span>
                </div>
                <button onClick={() => cancelInvite(inv.id, profile)} className="opacity-50 hover:opacity-100">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Friend requests */}
      {friendRequests.length > 0 && (
        <section>
          <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-3">Friend Requests</div>
          <div className="space-y-2">
            {friendRequests.map(req => (
              <div key={req.fromId} className="flex items-center justify-between border hairline px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-display text-xl">{req.fromAvatar}</span>
                  <span className="font-display text-base">{req.fromUsername}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => acceptFriendRequest(profile, req.fromId).then(() => toast('Friend added', 'success'))}
                          className="px-3 py-1 font-mono text-[0.65rem] tracking-widest uppercase hover:bg-black/5">Accept</button>
                  <button onClick={() => declineFriendRequest(profile, req.fromId)}
                          className="px-3 py-1 font-mono text-[0.65rem] tracking-widest uppercase opacity-50 hover:opacity-100">Decline</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent achievements */}
      {recentAchievements.length > 0 && (
        <section>
          <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-3">Recent Achievements</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {recentAchievements.map(id => {
              const a = ACHIEVEMENTS.find(x => x.id === id);
              if (!a) return null;
              return (
                <div key={id} className="border hairline p-3">
                  <div className="font-display text-base">{a.name}</div>
                  <div className="font-mono text-[0.65rem] tracking-wide opacity-60 mt-1">{a.desc}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="border hairline p-4">
      <div className="flex items-center gap-2 font-mono text-[0.65rem] tracking-widest uppercase opacity-60 mb-2">
        {icon} {label}
      </div>
      <div className="font-display text-3xl font-medium tabular-nums">{value}</div>
    </div>
  );
}

function SizeSelector({ value, onChange, label }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(Math.max(2, value - 1))}
                className="font-display text-2xl opacity-40 hover:opacity-100 transition-opacity w-6">−</button>
        <span className="font-display text-3xl tabular-nums" style={{ minWidth: 50, textAlign: 'center' }}>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(15, value + 1))}
                className="font-display text-2xl opacity-40 hover:opacity-100 transition-opacity w-6">+</button>
      </div>
      <div className="font-mono mt-1 text-[0.6rem] tracking-widest uppercase opacity-50">{label}</div>
    </div>
  );
}
