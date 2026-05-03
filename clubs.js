import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, runTransaction,
  arrayUnion,
} from 'firebase/firestore';
import { db } from './firebase';

// Maximum chat messages stored on a single club doc. New messages bump the
// oldest off, keeping the doc small enough that listening to it stays cheap.
const MAX_CHAT = 100;

// Maximum club name / description lengths
const MAX_NAME = 40;
const MAX_DESC = 200;

// Create a club. Owner becomes the first member.
export async function createClub(currentUser, { name, description, isPublic = true }) {
  const cleanName = (name || '').trim().slice(0, MAX_NAME);
  if (cleanName.length < 3) throw new Error('Club name must be at least 3 characters');
  const cleanDesc = (description || '').trim().slice(0, MAX_DESC);

  const ref = await addDoc(collection(db, 'clubs'), {
    name: cleanName,
    description: cleanDesc,
    ownerId: currentUser.id,
    members: [currentUser.id],
    memberInfo: {
      [currentUser.id]: {
        username: currentUser.username,
        avatar: currentUser.avatar || '◆',
      },
    },
    chat: [],
    createdAt: serverTimestamp(),
    isPublic,
  });
  return ref.id;
}

// Subscribe to a single club doc.
export function watchClub(clubId, callback) {
  return onSnapshot(doc(db, 'clubs', clubId), (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
    else callback(null);
  });
}

// List all public clubs (newest first). Capped at 50 — fine for a free-tier
// hobby project. If clubs grow past that, add pagination later.
export async function listPublicClubs() {
  const q = query(
    collection(db, 'clubs'),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// List clubs the current user is a member of.
export async function listMyClubs(uid) {
  const q = query(
    collection(db, 'clubs'),
    where('members', 'array-contains', uid),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Join a club. Uses a transaction to avoid races where two simultaneous
// joiners overwrite each other's memberInfo.
export async function joinClub(clubId, currentUser) {
  const ref = doc(db, 'clubs', clubId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Club not found');
    const c = snap.data();
    if (c.members.includes(currentUser.id)) return; // already a member
    const newMembers = [...c.members, currentUser.id];
    const newInfo = {
      ...(c.memberInfo || {}),
      [currentUser.id]: {
        username: currentUser.username,
        avatar: currentUser.avatar || '◆',
      },
    };
    tx.update(ref, { members: newMembers, memberInfo: newInfo });
  });
}

// Leave a club. The owner can't leave without first transferring ownership
// or deleting the club; we throw a clear error in that case.
export async function leaveClub(clubId, currentUser) {
  const ref = doc(db, 'clubs', clubId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const c = snap.data();
    if (!c.members.includes(currentUser.id)) return;
    if (c.ownerId === currentUser.id) {
      throw new Error('Owner can\'t leave — delete the club or transfer ownership first');
    }
    const newMembers = c.members.filter(id => id !== currentUser.id);
    const newInfo = { ...(c.memberInfo || {}) };
    delete newInfo[currentUser.id];
    tx.update(ref, { members: newMembers, memberInfo: newInfo });
  });
}

// Owner-only: delete the entire club.
export async function deleteClub(clubId, currentUser) {
  const ref = doc(db, 'clubs', clubId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  if (snap.data().ownerId !== currentUser.id) throw new Error('Only the owner can delete');
  await deleteDoc(ref);
}

// Send a chat message to a club. Caps the chat array at MAX_CHAT entries.
export async function sendClubChat(clubId, currentUser, text) {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return;
  const ref = doc(db, 'clubs', clubId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Club not found');
    const c = snap.data();
    if (!c.members.includes(currentUser.id)) throw new Error('Not a member');
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: currentUser.id,
      username: currentUser.username,
      avatar: currentUser.avatar || '◆',
      text: trimmed,
      ts: Date.now(),
    };
    const existing = c.chat || [];
    const newChat = existing.length >= MAX_CHAT
      ? [...existing.slice(existing.length - MAX_CHAT + 1), msg]
      : [...existing, msg];
    tx.update(ref, { chat: newChat });
  });
}
