import {
  collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// Activity types we record.
export const ACTIVITY_TYPES = {
  WIN: 'win',
  LOSS: 'loss',
  DRAW: 'draw',
  ACHIEVEMENT: 'achievement',
  FRIEND_ADDED: 'friend_added',
  CLUB_JOINED: 'club_joined',
  CLUB_CREATED: 'club_created',
};

// Append an activity entry. Best-effort — failures are swallowed so they
// never block the action that triggered them (e.g. finishing a match).
export async function recordActivity(currentUser, type, data = {}) {
  if (!currentUser?.id) return;
  try {
    await addDoc(collection(db, 'activities'), {
      userId: currentUser.id,
      username: currentUser.username,
      avatar: currentUser.avatar || '◆',
      type,
      data,
      ts: serverTimestamp(),
    });
  } catch (e) {
    console.warn('recordActivity failed:', e);
  }
}

// Fetch recent activity entries from a list of user ids (typically the
// current user's friends + self). Firestore caps `in` at 30 values; we
// chunk to handle larger friend lists.
export async function getActivityForUsers(userIds, max = 30) {
  if (!userIds || userIds.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < userIds.length; i += 30) {
    chunks.push(userIds.slice(i, i + 30));
  }
  const all = [];
  for (const chunk of chunks) {
    const q = query(
      collection(db, 'activities'),
      where('userId', 'in', chunk),
      orderBy('ts', 'desc'),
      limit(max)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => all.push({ id: d.id, ...d.data() }));
  }
  // Sort merged + cap
  all.sort((a, b) => {
    const ta = a.ts?.toMillis ? a.ts.toMillis() : 0;
    const tb = b.ts?.toMillis ? b.ts.toMillis() : 0;
    return tb - ta;
  });
  return all.slice(0, max);
}
