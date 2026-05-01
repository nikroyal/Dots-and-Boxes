import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { lookupUserByUsername, updateProfile, sendFriendRequest, removeFriend, blockUser } from '../lib/actions';
import { ACHIEVEMENTS, AVATAR_OPTIONS, TITLE_OPTIONS, getRankFromElo } from '../lib/achievements';
import { toast } from '../components/Notifications';
import { sfx } from '../lib/sound';
import { Edit2, UserPlus, UserMinus, Ban, Check } from 'lucide-react';

export default function Profile() {
  const { username } = useParams();
  const { profile: me } = useAuth();
  const [target, setTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editAvatar, setEditAvatar] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editBio, setEditBio] = useState('');

  const isMe = !username || (me && username === me.username);

  useEffect(() => {
    if (!me) return;
    setLoading(true);
    if (isMe) {
      setTarget(me);
      setEditAvatar(me.avatar || AVATAR_OPTIONS[0]);
      setEditTitle(me.title || '');
      setEditBio(me.bio || '');
      setLoading(false);
    } else {
      lookupUserByUsername(username).then(u => {
        setTarget(u);
        setLoading(false);
      });
    }
  }, [me, username, isMe]);

  if (!me) return null;
  if (loading) return <div className="font-mono text-xs opacity-50 text-center py-20">LOADING…</div>;
  if (!target) return <div className="font-mono text-sm opacity-60 text-center py-20">User not found</div>;

  const rank = getRankFromElo(target.elo || 1000);
  const winRate = target.gamesPlayed > 0 ? Math.round((target.wins / target.gamesPlayed) * 100) : 0;
  const isFriend = (me.friends || []).includes(target.id);
  const isBlocked = (me.blocked || []).includes(target.id);

  const saveProfile = async () => {
    try {
      await updateProfile(me, { avatar: editAvatar, title: editTitle, bio: editBio });
      toast('Profile updated', 'success');
      setEditing(false);
    } catch (e) { toast(e.message, 'error'); }
  };

  const handleAddFriend = async () => {
    try { await sendFriendRequest(me, target.username); toast('Friend request sent', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const handleRemoveFriend = async () => {
    if (!confirm(`Remove ${target.username} as a friend?`)) return;
    try { await removeFriend(me, target.id); toast('Friend removed'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const handleBlock = async () => {
    if (!confirm(`Block ${target.username}? They can't invite or friend you.`)) return;
    try { await blockUser(me, target.username); toast('User blocked'); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="fade-in space-y-10">
      {/* Hero */}
      <section className="flex items-start gap-6 flex-wrap">
        <div className="relative">
          <div className="font-display text-7xl">{target.avatar || '◆'}</div>
          {target.online && (
            <span className="absolute bottom-1 right-0 w-3 h-3 rounded-full" style={{ background: '#2F6B3F', border: '2px solid #FAFAF7' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-4xl font-medium tracking-tight">{target.displayName || target.username}</h1>
          <div className="font-mono text-xs tracking-widest uppercase mt-1 opacity-60">@{target.username}</div>
          {target.title && (
            <div className="font-display italic mt-2 opacity-80">{target.title}</div>
          )}
          <div className="mt-4 font-mono text-xs tracking-widest uppercase" style={{ color: rank.color }}>
            {rank.name} · {target.elo || 1000} ELO
          </div>
          {target.bio && (
            <div className="font-display mt-4 max-w-md leading-relaxed opacity-80">{target.bio}</div>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {isMe ? (
            <button onClick={() => setEditing(!editing)} className="btn-ghost">
              <Edit2 size={12} /> {editing ? 'Cancel' : 'Edit'}
            </button>
          ) : (
            <>
              {isFriend ? (
                <button onClick={handleRemoveFriend} className="btn-ghost">
                  <Check size={12} /> Friends
                </button>
              ) : (
                <button onClick={handleAddFriend} className="btn-primary">
                  <UserPlus size={12} /> Add Friend
                </button>
              )}
              {!isBlocked && (
                <button onClick={handleBlock} className="btn-danger">
                  <Ban size={12} /> Block
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {/* Edit form */}
      {isMe && editing && (
        <section className="card space-y-6">
          <div>
            <label className="font-mono block mb-3 text-[0.65rem] tracking-widest uppercase opacity-55">Avatar</label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_OPTIONS.map(av => (
                <button key={av} onClick={() => setEditAvatar(av)}
                        className="w-12 h-12 border hairline font-display text-2xl transition-all"
                        style={{
                          background: editAvatar === av ? 'rgba(26,26,26,0.08)' : 'transparent',
                          borderColor: editAvatar === av ? '#1A1A1A' : 'rgba(26,26,26,0.1)',
                        }}>
                  {av}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="font-mono block mb-2 text-[0.65rem] tracking-widest uppercase opacity-55">Title</label>
            <select value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className="input-field" style={{ background: 'transparent' }}>
              <option value="">— None —</option>
              {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="font-mono block mb-2 text-[0.65rem] tracking-widest uppercase opacity-55">Bio</label>
            <textarea value={editBio} onChange={e => setEditBio(e.target.value.slice(0, 200))}
                      className="input-field font-display text-base"
                      style={{ minHeight: 80, borderBottom: '1px solid rgba(26,26,26,0.2)', resize: 'vertical' }}
                      placeholder="A few words…" />
            <div className="font-mono text-[0.6rem] opacity-50 mt-1">{editBio.length}/200</div>
          </div>
          <button onClick={saveProfile} className="btn-primary">Save Changes</button>
        </section>
      )}

      {/* Stats grid */}
      <section>
        <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-3">Statistics</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Wins" value={target.wins || 0} />
          <Stat label="Losses" value={target.losses || 0} />
          <Stat label="Draws" value={target.draws || 0} />
          <Stat label="Win Rate" value={`${winRate}%`} />
          <Stat label="Total Boxes" value={target.totalBoxes || 0} />
          <Stat label="Best Streak" value={target.bestWinStreak || 0} />
          <Stat label="Biggest Chain" value={target.biggestChain || 0} />
          <Stat label="Perfect Wins" value={target.perfectWins || 0} />
        </div>
      </section>

      {/* Achievements */}
      <section>
        <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-3">
          Achievements ({(target.unlockedAchievements || []).length}/{ACHIEVEMENTS.length})
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ACHIEVEMENTS.map(a => {
            const unlocked = (target.unlockedAchievements || []).includes(a.id);
            return (
              <div key={a.id} className="border hairline p-3" style={{ opacity: unlocked ? 1 : 0.35 }}>
                <div className="font-display text-base">{a.name}</div>
                <div className="font-mono text-[0.65rem] tracking-wide opacity-70 mt-1">{a.desc}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border hairline p-4">
      <div className="font-mono text-[0.6rem] tracking-widest uppercase opacity-60 mb-2">{label}</div>
      <div className="font-display text-2xl font-medium tabular-nums">{value}</div>
    </div>
  );
}
