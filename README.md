# Dots & Boxes — online multiplayer

A real-time online Dots & Boxes game. React + Vite + Firebase (Auth + Firestore), deployed to Netlify.

## Features

- **Real-time multiplayer matches** with live board sync
- **ELO rating system** with leaderboard
- **Pre-game 3-2-1 countdown** synchronized between players
- **Per-turn 60-second timer** with claim-victory-on-timeout
- **Disconnect detection** via heartbeat
- **Pause / resume** matches with consent
- **Spectator mode** with chat
- **Replay** any past match move-by-move
- **23 achievements** to unlock
- **Friends, friend requests, blocking**
- **Direct messages** between any two players
- **Clubs** — create / join / chat in groups
- **Activity feed** showing your and friends' wins, losses, achievements
- **Quick Match** — auto-finds an opponent within ±200 ELO
- **Rematch button** on the win screen
- **Confetti** on victory (respects reduced-motion preference)
- **Themes** — Light / Dark / Sepia, persisted
- **Reduced motion** toggle

---

## Setup from scratch

### 1. Push this folder to GitHub

Create a new repo on GitHub. Either:
- Click "Add file → Upload files" and drop everything in this folder, OR
- Clone the empty repo locally, copy these files in, `git add . && git commit -m "Initial" && git push`

### 2. Set up Firebase

1. Go to https://console.firebase.google.com → **Add project**
2. Once created: in the project overview, click the `</>` icon to **add a Web app**. Name it whatever, skip Hosting setup.
3. Copy the `firebaseConfig` object Firebase shows you, then paste it into `src/lib/firebase.js`, replacing the existing one. (The current config in there points at a real project — replace it with yours unless you actually want to share that backend.)
4. In the Firebase console sidebar:
   - **Authentication → Get started → Sign-in method → Email/Password → Enable** (Email/Password only, not the link option)
   - **Firestore Database → Create database → Start in production mode → pick a region close to your users**
5. Once Firestore is created, go to its **Rules** tab. Delete what's there and paste the contents of `firestore.rules` from this folder. Click **Publish**.

### 3. Deploy to Netlify

1. Go to https://app.netlify.com → **Add new site → Import an existing project**
2. Connect your GitHub, pick the repo you just pushed
3. Build settings should auto-fill (Vite). If not: build command `npm run build`, publish directory `dist`. The included `netlify.toml` handles this automatically.
4. Click **Deploy**. First build takes ~2 minutes.

### 4. First login

The app uses usernames, not emails — internally, usernames are converted to fake emails like `you@dotsboxes.local` so Firebase Auth accepts them. You don't see this; just sign up with a username and password (6+ chars).

---

## Working without local dev

You don't need Node installed locally. Edit files directly on GitHub.com (pencil icon → commit) and Netlify auto-deploys on each commit.

If you do want local dev:
```
npm install
npm run dev
```

---

## File structure

```
.
├── firestore.rules               # Paste into Firebase Console rules tab
├── index.html                    # App shell + font loading
├── package.json                  # Dependencies
├── vite.config.js                # Vite build config
├── postcss.config.js             # PostCSS for Tailwind
├── tailwind.config.js            # Tailwind tokens
├── netlify.toml                  # Netlify build + SPA fallback
└── src/
    ├── main.jsx                  # Entry point — applies theme before render
    ├── App.jsx                   # Routes
    ├── index.css                 # Theme variables, animations, Tailwind layers
    ├── lib/
    │   ├── firebase.js           # Firebase config — REPLACE WITH YOUR OWN
    │   ├── AuthContext.jsx       # Auth + signup/login
    │   ├── gameLogic.js          # Pure board logic, no React/Firebase
    │   ├── actions.js            # All Firestore mutations + transactions
    │   ├── achievements.js       # Achievement catalog
    │   ├── theme.js              # Light/Dark/Sepia + reduced-motion
    │   ├── dms.js                # Direct messages
    │   ├── clubs.js              # Clubs
    │   ├── activity.js           # Activity feed
    │   ├── presence.js           # Heartbeat / disconnect detection
    │   └── sound.js              # Sound effects
    ├── components/
    │   ├── Header.jsx
    │   ├── Notifications.jsx     # Invite cards + toast
    │   ├── Confetti.jsx
    │   ├── EloChart.jsx
    │   └── ActivityFeed.jsx
    └── pages/
        ├── Login.jsx
        ├── Dashboard.jsx
        ├── Lobby.jsx
        ├── Match.jsx             # Live match — countdown, board, timer, chat
        ├── Replay.jsx
        ├── Profile.jsx
        ├── Friends.jsx
        ├── Leaderboard.jsx
        ├── Achievements.jsx
        ├── History.jsx
        ├── Messages.jsx          # DMs (list + thread)
        ├── Clubs.jsx             # Browse / create
        └── ClubDetail.jsx        # Single club + chat
```

---

## Firestore composite indexes

Firestore needs composite indexes for queries that combine multiple filters. The first time someone triggers an unindexed query, the browser console shows a one-click "create this index" URL. Click it, wait ~1 minute, the query starts working for everyone.

Likely indexes you'll be prompted to create:
- `conversations`: `participants` (array-contains) + `lastMessageAt` (desc)
- `activities`: `userId` (in) + `ts` (desc)
- `clubs`: `isPublic` (==) + `createdAt` (desc) — only if browse-clubs throws
- `clubs`: `members` (array-contains) — single-field, usually auto-indexed

---

## Known limitations / honest caveats

- **Per-turn timer is cheatable.** A determined attacker could disable JavaScript on their turn and never auto-forfeit. The opponent's "Claim Victory" button (which appears 5 seconds after the timer expires) is the safety net. Cheat-proofing would require Firebase Cloud Functions, which is on the paid Blaze plan.
- **Disconnect detection is approximate.** Heartbeats fire every 20s; if you don't see one for 60s, the opponent shows as "idle." Reconnection within 60s is invisible.
- **Clubs have no moderation.** Owner can delete; members can leave; non-members can join. No kick, no transfer-ownership, no role hierarchy. Capped at 100 chat messages stored on the doc (older roll off).
- **Activity feed is best-effort.** If your browser crashes mid-write, that activity is lost (the match itself is unaffected).
- **Activity reads are open.** Any signed-in user can read any user's activity entries. We filter to friends client-side. Not a privacy feature; it's a discoverability tradeoff.
- **No server-side validation of moves.** A malicious client could in theory send invalid moves; the rules trust the client. Same model the original had — fine for casual play with friends.
- **Some inline colors aren't themed.** Most of the app responds to theme changes; a few decorative borders are still hardcoded. Cosmetic, not functional.

---

## Things deliberately left out

These would each be a project of their own. Ask separately if you want any of them and I'll scope what's actually doable on the free tier:

- AI opponents / move analysis / puzzles (need a chess-like engine)
- Triangle/hex grids (gameLogic rewrite)
- 3- and 4-player games (ELO and stats are 1v1)
- Tournaments / seasons / divisions (need scheduled Cloud Functions)
- Translations (can't produce native-quality Hindi/Mandarin/etc.)
- Custom avatar uploads (need Firebase Storage)
- Move undo, idle timeouts (need server time)
- Best-of-N matches (needs match-series collection)
- Anti-smurf, placement matches (need server-side history validation)
