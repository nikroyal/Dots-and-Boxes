import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import {
  watchMyConversations, watchMessages, sendMessage,
  markConversationRead, openConversation,
} from '../lib/dms';
import { lookupUserByUsername } from '../lib/actions';
import { toast } from '../components/Notifications';
import { sfx } from '../lib/sound';
import { Send, ArrowLeft, MessageSquare } from 'lucide-react';

export default function Messages() {
  const { profile } = useAuth();
  const { convId: paramConvId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [newChatInput, setNewChatInput] = useState('');

  useEffect(() => {
    if (!profile) return;
    const unsub = watchMyConversations(profile.id, setConversations);
    return () => unsub();
  }, [profile?.id]);

  if (!profile) return null;

  const startNewChat = async (e) => {
    e?.preventDefault();
    const username = newChatInput.trim();
    if (!username) return;
    try {
      const target = await lookupUserByUsername(username);
      if (!target) { toast('User not found', 'error'); return; }
      if (target.id === profile.id) { toast("You can't message yourself", 'error'); return; }
      const convId = await openConversation(profile, target);
      setNewChatInput('');
      sfx.click();
      navigate(`/messages/${convId}`);
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="fade-in">
      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-0 border hairline" style={{ minHeight: 500, maxHeight: 700 }}>
        {/* Sidebar - conversation list */}
        <aside className={`border-r hairline flex flex-col ${paramConvId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b hairline">
            <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-2">Direct Messages</div>
            <form onSubmit={startNewChat} className="flex gap-2 items-center">
              <input
                value={newChatInput}
                onChange={e => setNewChatInput(e.target.value)}
                placeholder="Start new chat (username)"
                className="input-field text-sm"
              />
              <button type="submit" className="opacity-60 hover:opacity-100 px-2" disabled={!newChatInput.trim()}>
                <Send size={14} />
              </button>
            </form>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {conversations.length === 0 && (
              <div className="font-mono text-[0.65rem] opacity-40 text-center py-12 italic px-3">
                No conversations yet
              </div>
            )}
            {conversations.map(c => {
              const otherId = c.participants.find(p => p !== profile.id);
              const other = c.participantInfo?.[otherId] || { username: '?', avatar: '◆' };
              const unread = c.unreadFor?.[profile.id] || 0;
              const isActive = c.id === paramConvId;
              return (
                <Link
                  key={c.id}
                  to={`/messages/${c.id}`}
                  onClick={sfx.click}
                  className="flex items-center gap-3 p-3 border-b hairline transition-colors hover:bg-black/5"
                  style={{ background: isActive ? 'var(--bg-soft)' : 'transparent' }}>
                  <span className="font-display text-2xl shrink-0">{other.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-base truncate">{other.username}</span>
                      {unread > 0 && (
                        <span className="font-mono text-[0.6rem] px-1.5 py-0.5 tabular-nums shrink-0"
                              style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
                          {unread}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[0.65rem] opacity-60 truncate">
                      {c.lastMessage?.text || '(no messages)'}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </aside>

        {/* Active conversation pane */}
        <section className={`flex-col ${paramConvId ? 'flex' : 'hidden md:flex'}`}>
          {paramConvId ? (
            <ConversationView convId={paramConvId} profile={profile} onBack={() => navigate('/messages')} />
          ) : (
            <div className="flex-1 flex items-center justify-center py-20 opacity-50 font-display italic">
              <div className="text-center">
                <MessageSquare size={32} style={{ margin: '0 auto', opacity: 0.4 }} />
                <div className="mt-3 font-mono text-[0.65rem] tracking-widest uppercase">Select a conversation</div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationView({ convId, profile, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [conv, setConv] = useState(null);
  const endRef = useRef(null);
  const navigate = useNavigate();

  // Watch messages
  useEffect(() => {
    const unsub = watchMessages(convId, setMessages);
    return () => unsub();
  }, [convId]);

  // Watch the conversation doc itself for participant info
  useEffect(() => {
    let alive = true;
    getDoc(doc(db, 'conversations', convId)).then(snap => {
      if (alive && snap.exists()) setConv({ id: snap.id, ...snap.data() });
    }).catch(() => {});
    return () => { alive = false; };
  }, [convId]);

  // Mark read when this view is open + when messages arrive
  useEffect(() => {
    if (!profile) return;
    markConversationRead(convId, profile).catch(() => {});
  }, [convId, messages.length, profile?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim()) return;
    try {
      await sendMessage(convId, profile, input);
      setInput('');
    } catch (err) { toast(err.message, 'error'); }
  };

  const otherId = conv?.participants?.find(p => p !== profile.id);
  const other = conv?.participantInfo?.[otherId] || { username: '?', avatar: '◆' };

  return (
    <>
      <div className="px-4 py-3 border-b hairline flex items-center gap-3">
        <button onClick={onBack} className="md:hidden opacity-60 hover:opacity-100" aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <Link to={`/profile/${other.username}`} className="flex items-center gap-3 hover:opacity-70 min-w-0">
          <span className="font-display text-2xl shrink-0">{other.avatar}</span>
          <div className="font-display text-base truncate">{other.username}</div>
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin" style={{ minHeight: 300 }}>
        {messages.length === 0 && (
          <div className="font-mono text-[0.65rem] opacity-40 text-center py-12 italic">
            No messages yet — say hi
          </div>
        )}
        {messages.map(m => {
          const mine = m.fromId === profile.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[75%]">
                <div className="px-3 py-2 inline-block"
                     style={{
                       background: mine ? 'var(--ink)' : 'var(--bg-soft)',
                       color: mine ? 'var(--paper)' : 'var(--ink)',
                     }}>
                  <div className="font-display text-base leading-snug break-words">{m.text}</div>
                </div>
                <div className={`font-mono text-[0.55rem] tracking-widest opacity-40 mt-1 ${mine ? 'text-right' : 'text-left'}`}>
                  {m.ts?.toMillis ? timeShort(m.ts.toMillis()) : ''}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSend} className="border-t hairline p-3 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value.slice(0, 1000))}
          placeholder="Message…"
          className="flex-1 bg-transparent font-display text-base outline-none px-2"
          autoFocus
        />
        <button type="submit" disabled={!input.trim()} className="btn-primary px-3">
          <Send size={14} />
        </button>
      </form>
    </>
  );
}

function timeShort(ts) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
