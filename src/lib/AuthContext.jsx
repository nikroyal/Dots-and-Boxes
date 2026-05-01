import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db, usernameToEmail } from './firebase';
import { AVATAR_OPTIONS } from './achievements';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);          // Firebase user
  const [profile, setProfile] = useState(null);    // Firestore user doc
  const [loading, setLoading] = useState(true);

  // Listen for auth changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }
      // Mark online + listen to profile
      await updateDoc(doc(db, 'users', u.uid), {
        online: true,
        lastSeen: serverTimestamp(),
      }).catch(() => {});
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Subscribe to profile doc whenever user changes
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setProfile({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [user]);

  // Mark offline on tab close
  useEffect(() => {
    if (!user) return;
    const handleUnload = () => {
      // Best-effort — beacon would be ideal but Firestore doesn't expose one
      updateDoc(doc(db, 'users', user.uid), { online: false }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload();
    };
  }, [user]);

  const signup = async (username, password) => {
    const cleanUsername = username.toLowerCase().trim();
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername))
      throw new Error('Username must be 3-20 chars: letters, numbers, underscore');
    if (password.length < 6)
      throw new Error('Password must be at least 6 characters');

    // Check username uniqueness via dedicated lookup doc (case-insensitive)
    const usernameDoc = await getDoc(doc(db, 'usernames', cleanUsername));
    if (usernameDoc.exists()) throw new Error('Username taken');

    const cred = await createUserWithEmailAndPassword(
      auth, usernameToEmail(cleanUsername), password
    );
    const uid = cred.user.uid;

    // Wait for auth state to fully propagate (sometimes needed for Firestore rules)
  await new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u && u.uid === uid) { unsub(); resolve(); }
    });
  });

    // Create profile doc
    await setDoc(doc(db, 'users', uid), {
      username: cleanUsername,
      displayName: username.trim(),
      avatar: AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)],
      title: '',
      bio: '',
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      online: true,
      // Stats
      elo: 1000,
      wins: 0,
      losses: 0,
      draws: 0,
      gamesPlayed: 0,
      totalBoxes: 0,
      biggestChain: 0,
      perfectWins: 0,
      bigBoardWins: 0,
      comebackWins: 0,
      winStreak: 0,
      bestWinStreak: 0,
      fastestWin: null,
      // Social
      friends: [],
      friendRequests: [], // incoming
      blocked: [],
      // Achievements
      unlockedAchievements: [],
    });

    // Username -> uid lookup
    await setDoc(doc(db, 'usernames', cleanUsername), { uid });
  };

  const login = async (username, password) => {
    const cleanUsername = username.toLowerCase().trim();
    await signInWithEmailAndPassword(auth, usernameToEmail(cleanUsername), password);
  };

  const logout = async () => {
    if (user) {
      await updateDoc(doc(db, 'users', user.uid), { online: false }).catch(() => {});
    }
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
