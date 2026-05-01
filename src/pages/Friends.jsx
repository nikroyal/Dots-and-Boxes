import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { sendFriendRequest, removeFriend, unblockUser, acceptFriendRequest, declineFriendRequest } from '../lib/actions';
import { toast } from '../components/Notifications';
import { sfx } from '../lib/sound';
import { UserPlus, UserMinus, Send } from 'lucide-react';

export default function Friends() {
  const { profile } = useAuth();
  const [friendsData, setFriendsData] = useState([]);
  const [blockedData, setBlockedData] = useState([]);
  const [addInput, setAddInput] = useState('');
  const [tab, setTab] = useState('friends');

  useEffect(() => {
    if (!profile) return;
    Promise.all((profile.friends || []).map(id => getDoc(doc(db, 'users', id))))
      .then(snaps => setFriendsData(snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }))));
    Promise.all((profile.blocked || []).map(id => getDoc(doc(db, 'users', id))))
      .then(snaps => setBlockedData(snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }))));
  }, [profile?.friends, profile?.blocked]);

  if (!profile) return null;
  const requests = profile.friendRequests || [];

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addInput.trim()) return;
    try {
      await sendFriendRequest(profile, addInput.trim());
      toast('Friend request sent', 'success');
      setAddInput('');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="fade-in space-y-8">
      <section>
        <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-2">Social</div>
        <h1 className="font-display text-4xl font-medium tracking-tight">Friends</h1>
      </section>

      <form onSubmit={handleAdd} className="card flex items-end gap-3">
        <div className="flex-1">
          <label className="font-mono block mb-2 text-[0.65rem] tracking-widest uppercase opacity-55">Add Friend</label>
          <input value={addInput} onChange={e => setAddInput(e.target.value)} placeholder="username"
                 className="input-field" />
        </div>
        <button type="submit" className="btn-primary"><Send size={12} /> Send Request</button>
      </form>

      <div className="flex gap-1 border-b hairline">
        {[
          ['friends', `Friends (${friendsData.length})`],
          ['requests', `Requests (${requests.length})`],
          ['blocked', `Blocked (${blockedData.length})`],
        ].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); sfx.click(); }}
                  className="px-4 py-2 font-mono text-[0.7rem] tracking-widest uppercase transition-all"
                  style={{
                    borderBottom: `2px solid ${tab === id ? '#1A1A1A' : 'transparent'}`,
                    opacity: tab === id ? 1 : 0.5,
                    background: 'none', border: 'none', borderBottomWidth: '2px', borderBottomStyle: 'solid', cursor: 'pointer',
                  }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'friends' && (
        <div className="space-y-2">
          {friendsData.length === 0 && (
            <div className="font-display italic opacity-50 text-center py-12">No friends yet</div>
          )}
          {friendsData.map(f => (
            <div key={f.id} className="flex items-center justify-between border hairline px-4 py-3">
              <Link to={`/profile/${f.username}`} onClick={sfx.click} className="flex items-center gap-3 hover:opacity-70 flex-1 min-w-0">
                <div className="relative shrink-0">
                  <span className="font-display text-2xl">{f.avatar || '◆'}</span>
                  {f.online && <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: '#2F6B3F' }} />}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-base truncate">{f.displayName || f.username}</div>
                  <div className="font-mono text-[0.6rem] tracking-widest uppercase opacity-60">
                    {f.online ? 'Online' : 'Offline'} · {f.elo || 1000} ELO
                  </div>
                </div>
              </Link>
              <button onClick={() => removeFriend(profile, f.id).then(() => toast('Removed'))}
                      className="opacity-50 hover:opacity-100">
                <UserMinus size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-2">
          {requests.length === 0 && (
            <div className="font-display italic opacity-50 text-center py-12">No pending requests</div>
          )}
          {requests.map(r => (
            <div key={r.fromId} className="flex items-center justify-between border hairline px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="font-display text-2xl">{r.fromAvatar}</span>
                <span className="font-display text-base">{r.fromUsername}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => acceptFriendRequest(profile, r.fromId).then(() => toast('Accepted', 'success'))}
                        className="btn-primary">Accept</button>
                <button onClick={() => declineFriendRequest(profile, r.fromId)} className="btn-ghost">Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'blocked' && (
        <div className="space-y-2">
          {blockedData.length === 0 && (
            <div className="font-display italic opacity-50 text-center py-12">No blocked users</div>
          )}
          {blockedData.map(b => (
            <div key={b.id} className="flex items-center justify-between border hairline px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="font-display text-2xl opacity-50">{b.avatar || '◆'}</span>
                <span className="font-display text-base">{b.username}</span>
              </div>
              <button onClick={() => unblockUser(profile, b.id).then(() => toast('Unblocked'))} className="btn-ghost">
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
