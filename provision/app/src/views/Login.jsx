import { useState } from 'react';
import { login, setToken } from '../lib/auth.js';
import { Box } from '../components/icons.jsx';

// Demo seats — one per role, so RBAC is visible immediately. Listed openly because this is
// a local demo directory; a production build would drop this block entirely.
const SEATS = [
  { email: 'maria@trattoria.local', name: 'Maria Alvarez', role: 'Owner-operator' },
  { email: 'david@trattoria.local', name: 'David Okonkwo', role: 'General manager' },
  { email: 'tim@trattoria.local',   name: 'Tim Reyes',     role: 'Beverage director' },
  { email: 'sofia@trattoria.local', name: 'Sofia Marchetti', role: 'Floor lead' },
  { email: 'admin@trattoria.local', name: 'Admin',         role: 'Admin — can view as anyone' },
];

export default function Login({ onAuthed }) {
  const [email, setEmail] = useState('maria@trattoria.local');
  const [password, setPassword] = useState('mise');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await login(email, password);
      setToken(token);
      onAuthed(user);
    } catch (err) {
      setError(err.message || 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-5">
      <div className="w-full max-w-[420px] rise">
        <div className="flex items-center gap-3 mb-6 px-1">
          <div className="w-10 h-10 rounded-2xl grid place-items-center t-accent"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <Box size={19} />
          </div>
          <div>
            <div className="text-lg font-bold t-display leading-none">Mise</div>
            <div className="eyebrow mt-1.5">Supply chain · guest intelligence</div>
          </div>
        </div>

        <form className="card p-6" onSubmit={submit}>
          <h1 className="text-xl t-display mb-1">Sign in</h1>
          <p className="text-[13px] t-mut mb-5">Local demo directory — no external service is contacted.</p>

          <label className="eyebrow block mb-1.5">Email</label>
          <input className="field mb-3.5" type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} />

          <label className="eyebrow block mb-1.5">Password</label>
          <input className="field mb-4" type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} />

          {error && <div className="text-[13px] t-red mb-3">{error}</div>}

          <button className="btn primary w-full" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="card p-4 mt-3">
          <div className="eyebrow mb-2.5">Demo seats · password mise</div>
          <div className="flex flex-col gap-1">
            {SEATS.map((s) => (
              <button key={s.email} type="button"
                className="nav-item !justify-start gap-2.5 text-left"
                onClick={() => { setEmail(s.email); setPassword('mise'); }}>
                <span className="text-[13px] font-medium t-ink">{s.name}</span>
                <span className="text-[12px] t-mut ml-auto">{s.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
