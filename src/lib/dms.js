import {
  collection, doc, getDoc, setDoc, updateDoc, addDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// Conversation IDs are deterministic — sort the two UIDs and join. This means
// "is there an existing conversation between A and B" is just a doc lookup
// instead of a query, which is faster and cheaper.
export function conversationId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

// Get or create a conversation doc between current user and target.
// Returns the conversation id.
export async function openConversation(currentUser, target) {
  const convId = conversationId(currentUser.id, target.id);
  const convRef = doc(db, 'conversations', convId);
  const snap = await getDoc(convRef);
  if (snap.exists()) return convId;

  // Create it
  await setDoc(convRef, {
    participants: [currentUser.id, target.id],
    participantInfo: {
      [currentUser.id]: {
        username: currentUser.username,
        avatar: currentUser.avatar || '◆',
      },
      [target.id]: {
        username: target.username,
        avatar: target.avatar || '◆',
      },
    },
    lastMessage: null,
    lastMessageAt: serverTimestamp(),
    unreadFor: { [currentUser.id]: 0, [target.id]: 0 },
    createdAt: serverTimestamp(),
  });
  return convId;
}

// Subscribe to all conversations involving the current user, newest first.
// Returns the unsubscribe function.
export function watchMyConversations(uid, callback) {
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', uid),
    orderBy('lastMessageAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(list);
  }, (err) => {
    console.warn('watchMyConversations error:', err);
    callback([]);
  });
}

// Subscribe to messages within a single conversation, oldest first.
export function watchMessages(convId, callback) {
  const q = query(
    collection(db, 'conversations', convId, 'messages'),
    orderBy('ts', 'asc'),
    limit(200)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(list);
  });
}

// Send a message. Updates lastMessage on the conversation doc and increments
// the recipient's unread count.
export async function sendMessage(convId, currentUser, text) {
  const trimmed = text.trim().slice(0, 1000);
  if (!trimmed) return;

  const convRef = doc(db, 'conversations', convId);
  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) throw new Error('Conversation not found');
  const conv = convSnap.data();
  if (!conv.participants.includes(currentUser.id)) throw new Error('Not a participant');

  // Add the message
  await addDoc(collection(db, 'conversations', convId, 'messages'), {
    fromId: currentUser.id,
    fromUsername: currentUser.username,
    fromAvatar: currentUser.avatar || '◆',
    text: trimmed,
    ts: serverTimestamp(),
  });

  // Update conversation summary + recipient unread counter
  const otherId = conv.participants.find(p => p !== currentUser.id);
  const newUnread = { ...conv.unreadFor };
  newUnread[otherId] = (newUnread[otherId] || 0) + 1;
  newUnread[currentUser.id] = 0; // I just sent, so I've "read" up to now

  await updateDoc(convRef, {
    lastMessage: { text: trimmed, fromId: currentUser.id, ts: Date.now() },
    lastMessageAt: serverTimestamp(),
    unreadFor: newUnread,
  });
}

// Mark a conversation as read for the current user. Called when they open it.
export async function markConversationRead(convId, currentUser) {
  const convRef = doc(db, 'conversations', convId);
  const snap = await getDoc(convRef);
  if (!snap.exists()) return;
  const conv = snap.data();
  if (!conv.participants.includes(currentUser.id)) return;
  if ((conv.unreadFor?.[currentUser.id] || 0) === 0) return;
  const newUnread = { ...conv.unreadFor, [currentUser.id]: 0 };
  await updateDoc(convRef, { unreadFor: newUnread });
}

// Sum of unread counts across all conversations — for the header badge.
export function watchTotalUnread(uid, callback) {
  return watchMyConversations(uid, (convs) => {
    const total = convs.reduce((sum, c) => sum + (c.unreadFor?.[uid] || 0), 0);
    callback(total);
  });
}
