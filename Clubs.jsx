import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { listPublicClubs, listMyClubs, createClub } from '../lib/clubs';
import { recordActivity, ACTIVITY_TYPES } from '../lib/activity';
import { toast } from '../components/Notifications';
import { sfx } from '../lib/sound';
import { Users, Plus } from 'lucide-react';

export default function Clubs() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('mine');
  const [myClubs, setMyClubs] = useState(null);
  const [publicClubs, setPublicClubs] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!profile) return;
    listMyClubs(profile.id).then(setMyClubs).catch(err => {
      console.warn('listMyClubs:', err);
      setMyClubs([]);
    });
    listPublicClubs().then(setPublicClubs).catch(err => {
      console.warn('listPublicClubs:', err);
      setPublicClubs([]);
    });
  }, [profile?.id]);

  if (!profile) return null;

  const handleCreate = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const id = await createClub(profile, { name, description });
      // Best-effort activity entry
      recordActivity(profile, ACTIVITY_TYPES.CLUB_CREATED, { clubId: id, clubName: name.trim() });
      toast(`Club "${name.trim()}" created`, 'success');
      sfx.click();
      // Refresh
      const refreshed = await listMyClubs(profile.id);
      setMyClubs(refreshed);
      setName(''); setDescription(''); setShowCreate(false);
    } catch (err) { toast(err.message, 'error'); }
    setCreating(false);
  };

  const lists = tab === 'mine' ? myClubs : publicClubs;

  return (
    <div className="fade-in space-y-8">
      <section className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-2">Community</div>
          <h1 className="font-display text-4xl font-medium tracking-tight">Clubs</h1>
        </div>
        <button onClick={() => setShowCreate(s => !s)} className="btn-primary">
          <Plus size={14} /> {showCreate ? 'Cancel' : 'New Club'}
        </button>
      </section>

      {showCreate && (
        <section className="card">
          <form onSubmit={handleCreate} className="space-y-5">
            <div>
              <label className="font-mono block mb-2 text-[0.65rem] tracking-widest uppercase opacity-55">Name</label>
              <input className="input-field" value={name}
                     onChange={e => setName(e.target.value.slice(0, 40))}
                     placeholder="The Box Wranglers" autoFocus />
              <div className="font-mono text-[0.6rem] opacity-50 mt-1">{name.length}/40</div>
            </div>
            <div>
              <label className="font-mono block mb-2 text-[0.65rem] tracking-widest uppercase opacity-55">Description</label>
              <textarea className="input-field font-display text-base" value={description}
                        onChange={e => setDescription(e.target.value.slice(0, 200))}
                        placeholder="What's this club about?"
                        style={{ minHeight: 60, borderBottom: '1px solid var(--hairline-strong)', resize: 'vertical' }} />
              <div className="font-mono text-[0.6rem] opacity-50 mt-1">{description.length}/200</div>
            </div>
            <button type="submit" disabled={creating} className="btn-primary">
              {creating ? 'Creating…' : 'Create Club'}
            </button>
          </form>
        </section>
      )}

      <div className="flex gap-1 border-b hairline">
        {[['mine', `My Clubs (${myClubs?.length ?? '…'})`], ['public', `Browse (${publicClubs?.length ?? '…'})`]].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); sfx.click(); }}
                  className="px-4 py-2 font-mono text-[0.7rem] tracking-widest uppercase transition-all"
                  style={{
                    borderBottom: `2px solid ${tab === id ? 'var(--ink)' : 'transparent'}`,
                    opacity: tab === id ? 1 : 0.5,
                    background: 'none', border: 'none', borderBottomWidth: '2px', borderBottomStyle: 'solid', cursor: 'pointer',
                  }}>
            {label}
          </button>
        ))}
      </div>

      {lists === null ? (
        <div className="font-mono text-xs opacity-50 text-center py-12">LOADING…</div>
      ) : lists.length === 0 ? (
        <div className="font-display italic opacity-50 text-center py-12">
          {tab === 'mine' ? "You haven't joined any clubs yet" : 'No public clubs yet'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {lists.map(c => <ClubCard key={c.id} club={c} isMember={c.members?.includes(profile.id)} />)}
        </div>
      )}
    </div>
  );
}

function ClubCard({ club, isMember }) {
  return (
    <Link to={`/clubs/${club.id}`} className="card block transition-colors hover:bg-black/5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Users size={16} style={{ opacity: 0.6 }} />
          <span className="font-display text-xl truncate">{club.name}</span>
        </div>
        <span className="font-mono text-[0.6rem] tracking-widest uppercase opacity-60 shrink-0">
          {club.members?.length || 0} {(club.members?.length || 0) === 1 ? 'member' : 'members'}
        </span>
      </div>
      {club.description && (
        <div className="font-display text-sm opacity-75 leading-snug line-clamp-2">{club.description}</div>
      )}
      {isMember && (
        <div className="mt-3 pt-3 border-t hairline font-mono text-[0.6rem] tracking-widest uppercase opacity-60">
          You're a member
        </div>
      )}
    </Link>
  );
}
