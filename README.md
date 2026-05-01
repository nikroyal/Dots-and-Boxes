# Dots & Boxes Online — Setup Guide

A complete multiplayer Dots & Boxes app with accounts, matchmaking, spectating, chat, ELO ratings, friends, achievements, replays, and more. **No local installation required** — built with StackBlitz, Firebase, and Netlify (all free).

---

## What you're building

- 🔐 **Username/password accounts** (no email needed)
- 🎮 **Real-time matches** with 2×2 to 15×15 boards
- 👀 **Lobby + spectator mode** — watch live games
- 💬 **In-game chat** between players and spectators
- ⏸️ **Pause-with-consent** — board hides while paused so nobody can strategize
- 📊 **Stats, ELO ratings, leaderboard, match history, replays**
- 🏆 **20 achievements** with unlock notifications
- 👥 **Friends system** with requests, online status, blocking
- 🎨 **Profile customization** — avatars, titles, bios
- 🔊 **Sound effects** with mute toggle
- 🏁 **Win screen** with ELO change + achievement unlocks

---

## Setup overview

You'll do three things, in this order:

1. **Set up Firebase** (15 min) — provides auth, database, hosting
2. **Open the app in StackBlitz** (5 min) — paste your Firebase keys
3. **Deploy to Netlify** (5 min) — make it public

You don't need to install anything on your computer.

---

## Step 1: Set up Firebase (15 minutes)

Firebase is Google's free backend service. It handles user accounts and real-time data syncing for you.

### 1.1 — Create a Firebase project

1. Go to **https://console.firebase.google.com**
2. Sign in with any Google account
3. Click **Add project**
4. Name it whatever you want (e.g. `dots-and-boxes`)
5. Disable Google Analytics (you don't need it) → **Create project**
6. Wait ~30 seconds for it to finish

### 1.2 — Add a web app

1. On the project home page, click the **`</>`** icon (next to "Get started by adding Firebase to your app")
2. Give the app a nickname (e.g. `dots-and-boxes-web`) → **Register app**
3. **You'll see a code block with `firebaseConfig = { ... }`. COPY THIS WHOLE BLOCK** — you'll need it in Step 2. It looks like:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSyA...",
     authDomain: "dots-and-boxes.firebaseapp.com",
     projectId: "dots-and-boxes",
     storageBucket: "dots-and-boxes.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef"
   };
   ```

4. Click **Continue to console**

### 1.3 — Enable Authentication

1. In the left sidebar, click **Build → Authentication**
2. Click **Get started**
3. Under **Sign-in providers**, click **Email/Password**
4. Toggle **Enable** ON (leave the second toggle off)
5. Click **Save**

### 1.4 — Create the Firestore database

1. In the left sidebar, click **Build → Firestore Database**
2. Click **Create database**
3. Choose a location (pick one closest to your users; you can't change later) → **Next**
4. Choose **Start in production mode** → **Create**
5. Wait ~30 seconds

### 1.5 — Apply the security rules (CRITICAL)

This step protects your database from being abused. Do not skip it.

1. In Firestore, click the **Rules** tab
2. **Delete everything in the editor** and replace with the contents of `firestore.rules` (provided in this project)
3. Click **Publish**

Done with Firebase. ✅

---

## Step 2: Open in StackBlitz (5 minutes)

StackBlitz is an in-browser code editor. No installation needed.

### 2.1 — Open StackBlitz

1. Go to **https://stackblitz.com**
2. Click **Sign in** (use GitHub, Google, or email — free)

### 2.2 — Create a new Vite + React project

1. Click **+ New project** (or go to https://stackblitz.com/fork/vite-react)
2. Pick the **Vite + React (JavaScript)** template
3. Wait for it to load (~10 seconds)

### 2.3 — Replace the project files

You need to copy each file from this project into StackBlitz. The fastest way:

**Option A (recommended): Drag and drop**

If you downloaded this project as a zip:
1. In StackBlitz, delete the existing `src/` folder (right-click → delete)
2. Delete `package.json`, `vite.config.js`, `index.html`
3. Drag the folders/files from your computer into the StackBlitz file tree

**Option B: Copy/paste each file manually**

Create each file in StackBlitz with the same path and contents. The file structure should be:

```
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js
├── firestore.rules                  (not used at runtime, just reference)
└── src/
    ├── App.jsx
    ├── main.jsx
    ├── index.css
    ├── components/
    │   ├── Header.jsx
    │   └── Notifications.jsx
    ├── lib/
    │   ├── AuthContext.jsx
    │   ├── achievements.js
    │   ├── actions.js
    │   ├── firebase.js
    │   ├── gameLogic.js
    │   └── sound.js
    └── pages/
        ├── Achievements.jsx
        ├── Dashboard.jsx
        ├── Friends.jsx
        ├── History.jsx
        ├── Leaderboard.jsx
        ├── Lobby.jsx
        ├── Login.jsx
        ├── Match.jsx
        ├── Profile.jsx
        └── Replay.jsx
```

### 2.4 — Paste your Firebase config

Open `src/lib/firebase.js`. Find this block at the top:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  ...
};
```

**Replace it with the config you copied in Step 1.2.** Save the file (StackBlitz auto-saves).

### 2.5 — Install dependencies & run

StackBlitz should auto-detect and install dependencies. If you see a terminal panel:

```bash
npm install
npm run dev
```

A preview pane should open showing the login page. **Try it:**

1. Click **Sign Up**
2. Enter a username (e.g. `alice`) and password (6+ chars)
3. Click **Create Account**

You should land on the dashboard. 🎉

### 2.6 — Test multiplayer locally

In StackBlitz, click the **Open in new tab** button on the preview (top-right of the preview pane, looks like ↗). This gives you a public URL like `https://abc123.stackblitz.io`.

1. Open that URL in **two browser windows** (or one regular + one incognito)
2. Sign up as `alice` in window 1, `bob` in window 2
3. In Alice's window, send a challenge to `bob`
4. In Bob's window, an invite popup appears — accept it
5. Both windows should jump into the game
6. Take turns clicking lines — moves sync in real time

If this all works, you're golden. If something breaks, see **Troubleshooting** below.

---

## Step 3: Deploy to Netlify (5 minutes)

### 3.1 — Push from StackBlitz to GitHub

In StackBlitz, click the **GitHub** icon in the left sidebar:

1. Click **Connect to GitHub** if needed
2. Click **Create new repository**
3. Name it `dots-and-boxes` → **Create**

This puts your code on GitHub.

### 3.2 — Deploy on Netlify

1. Go to **https://netlify.com** → sign up with GitHub
2. Click **Add new site → Import an existing project**
3. Choose **GitHub** → pick your `dots-and-boxes` repo
4. Build settings (Netlify auto-detects Vite, but verify):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Click **Deploy**

Wait ~1 minute. You'll get a URL like `https://yourapp.netlify.app`. **Share it with friends** — that's your live game.

### 3.3 — Authorize your domain in Firebase

Firebase by default only accepts requests from `localhost` and Firebase domains. To let your Netlify URL work:

1. Firebase Console → **Authentication → Settings** → **Authorized domains**
2. Click **Add domain** → paste your Netlify URL (e.g. `yourapp.netlify.app`)
3. Save

Test the live site in two browsers — it should work just like StackBlitz.

---

## Updating the app later

Anytime you change code in StackBlitz:

1. Click the GitHub icon → **Commit & push**
2. Netlify auto-redeploys in ~1 minute

---

## Troubleshooting

### "Username taken" but I just signed up
You did. Try signing in instead. If that fails, the username already existed in Firebase — pick a different one.

### "Wrong username or password"
Check that you have **Email/Password sign-in enabled** in Firebase (Step 1.3).

### Nothing happens when I click anything; console shows "permission-denied"
Your Firestore security rules aren't applied. Re-do Step 1.5.

### "Missing or insufficient permissions" on the leaderboard or any page
Same as above — security rules.

### My friend's invite doesn't show up
- Both of you need to be signed in
- The username must be exact (not case-sensitive, but no typos)
- Refresh both pages

### Sounds don't play
Some browsers block audio until you interact with the page. Click anywhere first.

### The game feels slow
Firestore is real-time but free-tier latency can be ~200–500ms. This is normal.

---

## Free tier limits

Firebase free tier ("Spark plan") gives you:

- **50,000 reads/day** — plenty for hundreds of users
- **20,000 writes/day** — handles dozens of active games
- **1 GB storage** — you'll never hit this
- **Authentication: unlimited**

If you go viral and hit limits, the **Blaze plan** is pay-as-you-go and starts at ~$0/month for low usage with a free tier baked in.

Netlify free tier:
- **100 GB bandwidth/month**
- **Unlimited sites**

You can run this app for free indefinitely with hundreds of regular users.

---

## What's where in the code

| File | What it does |
|---|---|
| `src/App.jsx` | Top-level router and shell |
| `src/lib/firebase.js` | Firebase initialization (paste your config) |
| `src/lib/AuthContext.jsx` | User auth state, signup, login, logout |
| `src/lib/gameLogic.js` | Pure game rules — board, moves, ELO |
| `src/lib/actions.js` | All Firestore operations — invites, matches, chat, friends |
| `src/lib/achievements.js` | Achievement definitions and rank tiers |
| `src/lib/sound.js` | Sound effects (Web Audio API, no files) |
| `src/components/Header.jsx` | Top nav |
| `src/components/Notifications.jsx` | Invite popups and toast messages |
| `src/pages/*.jsx` | Each page (Login, Dashboard, Match, etc.) |

---

## Ideas for extending

- **AI opponents** — single-player vs computer
- **Tournaments** — bracket-based
- **Friend list filtering** — show only online friends
- **Sound pack themes** — chiptune, lofi, etc.
- **Move timer** — chess-clock style
- **Themed boards** — different visual styles
- **Mobile app** — wrap with Capacitor for iOS/Android

---

Have fun. Ping me if you get stuck on a step.
