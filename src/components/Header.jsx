import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { Volume2, VolumeX, LogOut, Settings, Sun, Moon, BookOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isSoundEnabled, setSoundEnabled, sfx } from '../lib/sound';
import { getRankFromElo } from '../lib/achievements';
import {
  getTheme, setTheme, getReducedMotion, setReducedMotion, THEMES,
} from '../lib/theme';
import { watchTotalUnread } from '../lib/dms';
import { startHeartbeat, stopHeartbeat } from '../lib/presence';

export default function Header() {
  const { profile, logout } = useAuth();
  const loc = useLocation();
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeState, setThemeState] = useState(getTheme());
  const [motionState, setMotionState] = useState(getReducedMotion());
  const [unreadCount, setUnreadCount] = useState(0);
  const settingsRef = useRef(null);

  // Subscribe to total unread DM count
  useEffect(() => {
    if (!profile) return;
    const unsub = watchTotalUnread(profile.id, setUnreadCount);
    return () => unsub();
  }, [profile?.id]);

  // Start heartbeat once profile is loaded; stop on unmount/logout.
  // The heartbeat module is idempotent so re-running this on prop changes
  // is safe.
  useEffect(() => {
    if (!profile?.id) return;
    startHeartbeat(profile.id);
    return () => stopHeartbeat();
  }, [profile?.id]);

  // Close settings menu when clicking outside
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  const toggleSound = () => {
    const v = !soundOn;
    setSoundEnabled(v);
    setSoundOn(v);
    if (v) sfx.click();
  };

  const pickTheme = (t) => { setTheme(t); setThemeState(t); sfx.click(); };
  const toggleMotion = () => {
    const v = !motionState;
    setReducedMotion(v);
    setMotionState(v);
    sfx.click();
  };

  const navItem = (to, label, badge = 0) => {
    const active = loc.pathname === to || (to !== '/' && loc.pathname.startsWith(to));
    return (
      <Link
        to={to}
        onClick={sfx.click}
        className="font-mono px-3 py-1 text-[0.7rem] tracking-widest uppercase transition-opacity inline-flex items-center gap-1.5"
        style={{ opacity: active ? 1 : 0.5 }}
      >
        {label}
        {badge > 0 && (
          <span className="font-mono text-[0.55rem] tabular-nums px-1"
                style={{ background: 'var(--crimson)', color: 'var(--paper)', minWidth: 16, textAlign: 'center' }}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </Link>
    );
  };

  const rank = profile ? getRankFromElo(profile.elo || 1000) : null;

  return (
    <header className="border-b hairline sticky top-0 z-30" style={{ background: 'var(--header-bg)', backdropFilter: 'blur(8px)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="font-display text-lg font-medium tracking-tight" onClick={sfx.click}>
          Dots <em className="font-normal">&amp;</em> Boxes
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navItem('/', 'Home')}
          {navItem('/lobby', 'Lobby')}
          {navItem('/leaderboard', 'Ranks')}
          {navItem('/friends', 'Friends')}
          {navItem('/messages', 'Msgs', unreadCount)}
          {navItem('/clubs', 'Clubs')}
          {navItem('/history', 'History')}
        </nav>

        <div className="flex items-center gap-3">
          {/* Settings */}
          <div className="relative" ref={settingsRef}>
            <button onClick={() => setSettingsOpen(s => !s)}
                    className="opacity-50 hover:opacity-100 transition-opacity"
                    title="Settings" aria-label="Settings">
              <Settings size={16} />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 mt-2 w-56 border hairline z-40"
                   style={{ background: 'var(--paper-tint)', boxShadow: 'var(--shadow)' }}>
                <div className="p-3 space-y-3">
                  <div>
                    <div className="font-mono text-[0.6rem] tracking-widest uppercase opacity-60 mb-2">Theme</div>
                    <div className="flex gap-1">
                      {THEMES.map(t => (
                        <button key={t} onClick={() => pickTheme(t)}
                                className="flex-1 py-1.5 px-2 font-mono text-[0.6rem] tracking-widest uppercase transition-all"
                                style={{
                                  border: `1px solid ${themeState === t ? 'var(--ink)' : 'var(--hairline)'}`,
                                  background: themeState === t ? 'var(--bg-soft)' : 'transparent',
                                  color: 'var(--ink)',
                                  cursor: 'pointer',
                                }}>
                          {t === 'light' && <Sun size={11} className="inline mr-1" />}
                          {t === 'dark'  && <Moon size={11} className="inline mr-1" />}
                          {t === 'sepia' && <BookOpen size={11} className="inline mr-1" />}
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pt-1 border-t hairline" />
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="font-mono text-[0.65rem] tracking-widest uppercase opacity-80">Reduced motion</span>
                    <input type="checkbox" checked={motionState} onChange={toggleMotion}
                           style={{ accentColor: 'var(--ink)' }} />
                  </label>
                </div>
              </div>
            )}
          </div>

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
        {navItem('/messages', 'Msgs', unreadCount)}
        {navItem('/clubs', 'Clubs')}
        {navItem('/history', 'History')}
      </nav>
    </header>
  );
}
