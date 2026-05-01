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
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Convert username to fake email so Firebase Auth accepts it.
// Users only ever see/type their username — this is internal plumbing.
export const USERNAME_DOMAIN = '@dotsboxes.local';
export const usernameToEmail = (username) => `${username.toLowerCase().trim()}${USERNAME_DOMAIN}`;
export const emailToUsername = (email) => email.replace(USERNAME_DOMAIN, '');
