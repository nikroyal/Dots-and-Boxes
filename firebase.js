// ============================================================================
// FIREBASE SETUP — REPLACE WITH YOUR OWN CONFIG
// ============================================================================
// 1. Go to https://console.firebase.google.com
// 2. Create a new project
// 3. Add a web app (the </> icon)
// 4. Copy the firebaseConfig object and paste it here, replacing the values below
// 5. Enable Authentication → Email/Password sign-in method
// 6. Create Firestore Database (start in production mode, paste the rules from firestore.rules)
// ============================================================================

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBVGeK5bxFKRidj-UkNnTXlHmZ40A9_-2s",
  authDomain: "dots-and-boxes-1a5f9.firebaseapp.com",
  projectId: "dots-and-boxes-1a5f9",
  storageBucket: "dots-and-boxes-1a5f9.firebasestorage.app",
  messagingSenderId: "709974944953",
  appId: "1:709974944953:web:9e1542ed1108723ec3ff68"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Convert username to fake email so Firebase Auth accepts it.
// Users only ever see/type their username — this is internal plumbing.
export const USERNAME_DOMAIN = '@dotsboxes.local';
export const usernameToEmail = (username) => `${username.toLowerCase().trim()}${USERNAME_DOMAIN}`;
export const emailToUsername = (email) => email.replace(USERNAME_DOMAIN, '');
