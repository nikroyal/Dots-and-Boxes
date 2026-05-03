import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { sfx } from '../lib/sound';

export default function Login() {
  const [mode, setMode] = useState('login'); // login | signup
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') await signup(username, password);
      else await login(username, password);
      sfx.click();
      navigate('/');
    } catch (err) {
      const msg = err.message || String(err);
      // Translate Firebase errors
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found'))
        setError('Wrong username or password');
      else if (msg.includes('auth/email-already-in-use'))
        setError('Username taken');
      else if (msg.includes('auth/weak-password'))
        setError('Password must be at least 6 characters');
      else
        setError(msg);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm fade-in">
        <div className="text-center mb-12">
          <div className="font-mono text-[0.65rem] tracking-[0.3em] opacity-50 mb-3">A PARLOR GAME</div>
          <h1 className="font-display text-5xl font-medium tracking-tight leading-none">
            Dots <em className="font-normal">&amp;</em> Boxes
          </h1>
          <div className="mt-6 mx-auto" style={{ width: 40, height: 1, background: 'var(--hairline-strong)' }} />
        </div>

        <div className="flex gap-1 mb-8">
          {['login', 'signup'].map(m => (
            <button
              type="button"
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              className="flex-1 py-3 font-mono text-[0.7rem] tracking-widest uppercase transition-all"
              style={{
                borderBottom: `1px solid ${mode === m ? 'var(--ink)' : 'var(--hairline)'}`,
                opacity: mode === m ? 1 : 0.5,
                background: 'none', border: 'none', borderBottomWidth: '1px', borderBottomStyle: 'solid',
                cursor: 'pointer',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <div className="space-y-6">
          <div>
            <label className="font-mono block mb-2 text-[0.65rem] tracking-widest uppercase opacity-55">Username</label>
            <input
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value.slice(0, 20))}
              placeholder="—"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div>
            <label className="font-mono block mb-2 text-[0.65rem] tracking-widest uppercase opacity-55">Password</label>
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="—"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? '…' : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </div>

        {error && (
          <div className="font-mono text-xs text-center mt-6" style={{ color: 'var(--crimson)' }}>
            {error}
          </div>
        )}

        {mode === 'signup' && (
          <div className="font-mono text-[0.65rem] mt-6 opacity-50 text-center leading-relaxed">
            Username: 3-20 chars, lowercase letters/numbers/underscore.<br/>
            Password: 6+ characters.
          </div>
        )}
      </form>
    </div>
  );
}
