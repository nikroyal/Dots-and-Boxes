import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { acceptInvite, declineInvite } from '../lib/actions';
import { sfx } from '../lib/sound';
import { Check, X } from 'lucide-react';

export default function Notifications() {
  const { profile } = useAuth();
  const [invites, setInvites] = useState([]);
  const [toasts, setToasts] = useState([]);
  const navigate = useNavigate();

  // Watch incoming invites
  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, 'invites'),
      where('toId', '==', profile.id),
      where('status', '==', 'pending')
    );
    const seen = new Set();
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sound for new invites
      list.forEach(inv => { if (!seen.has(inv.id)) { sfx.notify(); seen.add(inv.id); } });
      setInvites(list);
    });
    return () => unsub();
  }, [profile]);

  const handleAccept = async (inv) => {
    try {
      const matchId = await acceptInvite(inv.id, profile);
      sfx.click();
      navigate(`/match/${matchId}`);
    } catch (e) { addToast(e.message, 'error'); }
  };

  const handleDecline = async (inv) => {
    try { await declineInvite(inv.id, profile); sfx.click(); }
    catch (e) { addToast(e.message, 'error'); }
  };

  const addToast = (text, type) => {
    const id = Math.random();
    setToasts(t => [...t, { id, text, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  // Listen for global toast events
  useEffect(() => {
    const handler = (e) => addToast(e.detail.text, e.detail.type || 'info');
    window.addEventListener('toast', handler);
    return () => window.removeEventListener('toast', handler);
  }, []);

  return (
    <>
      {/* Invite cards (top of screen) */}
      {invites.length > 0 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4 space-y-2">
          {invites.map(inv => (
            <div key={inv.id} className="card fade-in flex items-center justify-between gap-3"
                 style={{ background: 'var(--paper-tint)', boxShadow: 'var(--shadow)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-display text-2xl">{inv.fromAvatar}</span>
                <div className="min-w-0">
                  <div className="font-display text-base truncate">
                    <span className="font-medium">{inv.fromUsername}</span> challenges you
                  </div>
                  <div className="font-mono text-[0.65rem] tracking-widest opacity-60 uppercase">
                    {inv.rows} × {inv.cols} board · {inv.fromElo} ELO
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => handleAccept(inv)} className="p-2 hover:bg-black/5 transition-colors" title="Accept">
                  <Check size={18} style={{ color: 'var(--forest)' }} />
                </button>
                <button onClick={() => handleDecline(inv)} className="p-2 hover:bg-black/5 transition-colors" title="Decline">
                  <X size={18} style={{ color: 'var(--crimson)' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toasts (bottom of screen) */}
      <div className="fixed bottom-6 right-6 z-40 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className="card fade-in font-mono text-xs tracking-wide" style={{
            background: 'var(--paper-tint)',
            color: t.type === 'error' ? 'var(--crimson)' : t.type === 'success' ? 'var(--forest)' : 'var(--ink)',
            boxShadow: 'var(--shadow)',
          }}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

// Helper to fire toasts from anywhere
export function toast(text, type = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { text, type } }));
}
