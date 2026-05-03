import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { watchClub, joinClub, leaveClub, deleteClub, sendClubChat } from '../lib/clubs';
import { recordActivity, ACTIVITY_TYPES } from '../lib/activity';
import { toast } from '../components/Notifications';
import { sfx } from '../lib/sound';
import { Send, ArrowLeft, Users, Trash2, LogOut, UserPlus } from 'lucide-react';

export default function ClubDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [busy, setBusy] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    const unsub = watchClub(id, setClub);
    return () => unsub();
  }, [id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [club?.chat?.length]);

  if (!profile) return null;
  if (club === null) return <div className="font-mono text-xs opacity-50 text-center py-20">LOADING…</div>;
  if (!club) return (
    <div className="text-center py-20">
      <div className="font-display italic opacity-50">Club not found</div>
      <button onClick={() => navigate('/clubs')} className="btn-ghost mt-6">Back to Clubs</button>
    </div>
  );

  const isMember = club.members?.includes(profile.id);
  const isOwner = club.ownerId === profile.id;

  const handleJoin = async () => {
    setBusy(true);
    try {
      await joinClub(id, profile);
      recordActivity(profile, ACTIVITY_TYPES.CLUB_JOINED, { clubId: id, clubName: club.name });
      toast(`Joined ${club.name}`, 'success');
      sfx.click();
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };

  const handleLeave = async () => {
    if (!confirm(`Leave ${club.name}?`)) return;
    setBusy(true);
    try {
      await leaveClub(id, profile);
      toast(`Left ${club.name}`);
      sfx.click();
      navigate('/clubs');
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${club.name}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await deleteClub(id, profile);
      toast('Club deleted');
      navigate('/clubs');
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };

  const handleSendChat = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    try {
      await sendClubChat(id, profile, chatInput);
      setChatInput('');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="fade-in space-y-6">
      <button onClick={() => navigate('/clubs')} className="font-mono text-[0.65rem] tracking-widest uppercase opacity-60 hover:opacity-100">
        <ArrowLeft size={12} className="inline mr-1" /> Back to Clubs
      </button>

      <section>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-2">
              <Users size={12} /> Club · {club.members?.length || 0} {(club.members?.length || 0) === 1 ? 'member' : 'members'}
            </div>
            <h1 className="font-display text-4xl font-medium tracking-tight">{club.name}</h1>
            {club.description && (
              <p className="font-display mt-3 max-w-2xl leading-relaxed opacity-80">{club.description}</p>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {!isMember && (
              <button onClick={handleJoin} disabled={busy} className="btn-primary">
                <UserPlus size={12} /> Join Club
              </button>
            )}
            {isMember && !isOwner && (
              <button onClick={handleLeave} disabled={busy} className="btn-ghost">
                <LogOut size={12} /> Leave
              </button>
            )}
            {isOwner && (
              <button onClick={handleDelete} disabled={busy} className="btn-danger">
                <Trash2 size={12} /> Delete Club
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        {/* Chat */}
        <section className="border hairline flex flex-col" style={{ minHeight: 400, maxHeight: 600 }}>
          <div className="px-4 py-3 border-b hairline font-mono text-[0.65rem] tracking-widest uppercase opacity-60">
            Club Chat
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
            {(club.chat || []).length === 0 && (
              <div className="font-mono text-[0.65rem] opacity-40 text-center py-8 italic">
                No messages yet
              </div>
            )}
            {(club.chat || []).map(msg => (
              <div key={msg.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-base shrink-0">{msg.avatar}</span>
                  <span className="font-mono text-[0.65rem] tracking-wide font-medium">{msg.username}</span>
                  <span className="font-mono text-[0.55rem] tracking-widest uppercase opacity-40 ml-auto">
                    {timeAgo(msg.ts)}
                  </span>
                </div>
                <div className="font-display text-base ml-7 leading-snug break-words">{msg.text}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {isMember ? (
            <form onSubmit={handleSendChat} className="border-t hairline p-2 flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value.slice(0, 500))}
                placeholder="Say something…"
                className="flex-1 bg-transparent font-display text-base outline-none px-2"
              />
              <button type="submit" disabled={!chatInput.trim()} className="opacity-60 hover:opacity-100 disabled:opacity-20 px-2">
                <Send size={14} />
              </button>
            </form>
          ) : (
            <div className="border-t hairline px-4 py-3 font-mono text-[0.65rem] tracking-widest uppercase opacity-50 text-center">
              Join to chat
            </div>
          )}
        </section>

        {/* Members list */}
        <section className="border hairline">
          <div className="px-3 py-2 border-b hairline font-mono text-[0.65rem] tracking-widest uppercase opacity-60">
            Members
          </div>
          <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto scrollbar-thin">
            {(club.members || []).map(uid => {
              const info = club.memberInfo?.[uid] || { username: '?', avatar: '◆' };
              return (
                <Link key={uid} to={`/profile/${info.username}`}
                      className="flex items-center gap-2 px-2 py-1 hover:bg-black/5">
                  <span className="font-display text-lg">{info.avatar}</span>
                  <span className="font-display text-sm truncate">{info.username}</span>
                  {uid === club.ownerId && (
                    <span className="font-mono text-[0.5rem] tracking-widest uppercase opacity-50 ml-auto">owner</span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}
