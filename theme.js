// Theme + reduced-motion preferences. Applied to the <html> element via
// data attributes (data-theme, data-reduced-motion) which CSS in index.css
// keys off. Persisted to localStorage so they survive reloads.

export const THEMES = ['light', 'dark', 'sepia'];

const THEME_KEY = 'db-theme';
const MOTION_KEY = 'db-reduced-motion';

export function getTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (THEMES.includes(v)) return v;
  } catch {}
  return 'light';
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  applyTheme();
}

export function getReducedMotion() {
  try {
    const v = localStorage.getItem(MOTION_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {}
  // Fall back to system preference
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

export function setReducedMotion(on) {
  try { localStorage.setItem(MOTION_KEY, on ? '1' : '0'); } catch {}
  applyTheme();
}

// Apply current preferences to <html>. Safe to call repeatedly.
export function applyTheme() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', getTheme());
  if (getReducedMotion()) root.setAttribute('data-reduced-motion', 'true');
  else root.removeAttribute('data-reduced-motion');
}
