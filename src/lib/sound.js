// Tiny sound effect engine using Web Audio API.
// No audio files needed — synthesized on the fly.

let ctx = null;
let enabled = true;

function getCtx() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  return ctx;
}

export function setSoundEnabled(v) {
  enabled = v;
  try { localStorage.setItem('sound-enabled', v ? '1' : '0'); } catch {}
}

export function isSoundEnabled() {
  try {
    const v = localStorage.getItem('sound-enabled');
    return v === null ? true : v === '1';
  } catch { return true; }
}

// Initialize from storage
enabled = isSoundEnabled();

function tone(freq, duration = 0.1, type = 'sine', vol = 0.1) {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

export const sfx = {
  line:    () => tone(440, 0.08, 'triangle', 0.06),
  claim:   () => { tone(660, 0.1, 'sine', 0.08); setTimeout(() => tone(880, 0.12, 'sine', 0.08), 80); },
  win:     () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.1), i * 100));
  },
  loss:    () => {
    [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'sine', 0.08), i * 120));
  },
  notify:  () => tone(880, 0.12, 'sine', 0.08),
  message: () => tone(1200, 0.06, 'square', 0.04),
  achievement: () => {
    [659, 784, 988, 1175].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'triangle', 0.09), i * 80));
  },
  click:   () => tone(220, 0.04, 'square', 0.04),
};
