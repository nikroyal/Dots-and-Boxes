import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Header from './components/Header';
import Notifications from './components/Notifications';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Lobby from './pages/Lobby';
import Match from './pages/Match';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import Friends from './pages/Friends';
import Achievements from './pages/Achievements';
import History from './pages/History';
import Replay from './pages/Replay';
import Messages from './pages/Messages';
import Clubs from './pages/Clubs';
import ClubDetail from './pages/ClubDetail';

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-mono text-xs tracking-widest opacity-50">LOADING…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <Notifications />
      <main className="flex-1 px-4 sm:px-6 py-8 max-w-6xl mx-auto w-full">
        <Routes>
          <Route path="/"               element={<Dashboard />} />
          <Route path="/lobby"          element={<Lobby />} />
          <Route path="/match/:id"      element={<Match />} />
          <Route path="/profile/:username" element={<Profile />} />
          <Route path="/profile"        element={<Profile />} />
          <Route path="/leaderboard"    element={<Leaderboard />} />
          <Route path="/friends"        element={<Friends />} />
          <Route path="/achievements"   element={<Achievements />} />
          <Route path="/history"        element={<History />} />
          <Route path="/replay/:id"     element={<Replay />} />
          <Route path="/messages"       element={<Messages />} />
          <Route path="/messages/:convId" element={<Messages />} />
          <Route path="/clubs"          element={<Clubs />} />
          <Route path="/clubs/:id"      element={<ClubDetail />} />
          <Route path="*"               element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
