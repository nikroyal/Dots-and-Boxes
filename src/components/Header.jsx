import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { Volume2, VolumeX, LogOut } from 'lucide-react';
import { useState } from 'react';
import { isSoundEnabled, setSoundEnabled, sfx } from '../lib/sound';
import { getRankFromElo } from '../lib/achievements';

export default function Header() {
  const { profile, logout } = useAuth();
  const loc = useLocation();
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  const toggleSound = () => {
    const v = !soundOn;
    setSoundEnabled(v);
    setSoundOn(v);
    if (v) sfx.click();
  };

  const navItem = (to, label) => {
    const active = loc.pathname === to || (to !== '/' && loc.pathname.startsWith(to));
    return (
      <Link
        to={to}
        onClick={sfx.click}
        className="font-mono px-3 py-1 text-[0.7rem] tracking-widest uppercase transition-opacity"
        style={{ opacity: active ? 1 : 0.5 }}
      >
        {label}
      </Link>
    );
  };

  const rank = profile ? getRankFromElo(profile.elo || 1000) : null;

  return (
    <header className="border-b hairline sticky top-0 z-30" style={{ background: 'rgba(250,250,247,0.92)', backdropFilter: 'blur(8px)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="font-display text-lg font-medium tracking-tight" onClick={sfx.click}>
          Dots <em className="font-normal">&amp;</em> Boxes
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navItem('/', 'Home')}
          {navItem('/lobby', 'Lobby')}
          {navItem('/leaderboard', 'Ranks')}
          {navItem('/friends', 'Friends')}
          {navItem('/history', 'History')}
        </nav>

        <div className="flex items-center gap-3">
          <button onClick={toggleSound} className="opacity-50 hover:opacity-100 transition-opacity" title={soundOn ? 'Mute' : 'Unmute'}>
            {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          {profile && (
            <Link to="/profile" onClick={sfx.click} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
              <span className="font-display text-lg leading-none">{profile.avatar}</span>
              <div className="text-right hidden sm:block">
                <div className="font-display text-sm leading-tight">{profile.username}</div>
                <div className="font-mono text-[0.6rem] tracking-widest opacity-60" style={{ color: rank?.color }}>
                  {rank?.name} · {profile.elo || 1000}
                </div>
              </div>
            </Link>
          )}
          <button onClick={logout} className="opacity-50 hover:opacity-100 transition-opacity" title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="md:hidden flex items-center justify-center gap-1 px-4 py-2 border-t hairline overflow-x-auto">
        {navItem('/', 'Home')}
        {navItem('/lobby', 'Lobby')}
        {navItem('/leaderboard', 'Ranks')}
        {navItem('/friends', 'Friends')}
        {navItem('/history', 'History')}
      </nav>
    </header>
  );
}
