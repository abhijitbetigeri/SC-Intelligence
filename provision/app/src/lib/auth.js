// Auth client — token in localStorage, sent as a Bearer header (keeps CORS simple).
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8788';
const KEY = 'provision-auth';
const STASH = 'provision-auth-stash';

export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* ignore */ } };
export const clearToken = () => { setToken(null); try { localStorage.removeItem(STASH); } catch { /* ignore */ } };

async function req(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const tok = getToken();
  if (auth && tok) headers.Authorization = `Bearer ${tok}`;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) {
    let msg;
    try { msg = (await r.json()).error; } catch { /* ignore */ }
    throw new Error(msg || `HTTP ${r.status}`);
  }
  return r.json();
}

export const login = (email, password) => req('/auth/login', { method: 'POST', body: { email, password }, auth: false });
export const me = () => req('/auth/me');
export const getTeam = () => req('/api/team');

// Demo "view as" — an admin occupies a teammate's seat to show role-scoped access. The
// admin's own token is stashed so returning is one click and survives a reload.
export async function impersonate(id) {
  const { token } = await req(`/admin/users/${id}/impersonate`, { method: 'POST' });
  try { if (!localStorage.getItem(STASH)) localStorage.setItem(STASH, getToken() || ''); } catch { /* ignore */ }
  setToken(token);
  location.reload();
}
export function endImpersonation() {
  try {
    const orig = localStorage.getItem(STASH);
    localStorage.removeItem(STASH);
    if (orig) setToken(orig);
  } catch { /* ignore */ }
  location.reload();
}
export const isImpersonating = () => { try { return Boolean(localStorage.getItem(STASH)); } catch { return false; } };
