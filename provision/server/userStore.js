// User directory — the RBAC seat list. Durable via persist.js, same seam as records.
// DEMO: seeded local accounts (password `mise`). PRODUCTION: InsForge Auth.
import { load, save } from './persist.js';
import { hashPassword, defaultDashboards, publicUser } from './auth.js';

const users = new Map(load('users', []).map((u) => [u.id, u]));
const flush = () => save('users', [...users.values()]);
const norm = (e) => String(e || '').trim().toLowerCase();

export const userStore = {
  raw: (id) => users.get(id) || null,
  byEmail: (email) => [...users.values()].find((u) => norm(u.email) === norm(email)) || null,
  list: () => [...users.values()].map(publicUser),
  create(u) {
    const id = u.id || `user_${users.size + 1}`;
    const rec = { id, active: true, ...u, email: norm(u.email) };
    users.set(id, rec);
    flush();
    return publicUser(rec);
  },
  update(id, patch) {
    const u = users.get(id);
    if (!u) return null;
    Object.assign(u, patch);
    flush();
    return publicUser(u);
  },
  remove(id) { const ok = users.delete(id); flush(); return ok; },
};

// Idempotent demo directory so login works out of the box. One seat per role, so the
// "view as" switcher has somewhere to go and RBAC is visible in the demo.
const DEMO = [
  { id: 'user_admin', name: 'Admin',        email: 'admin@trattoria.local',    role: 'admin' },
  { id: 'user_maria', name: 'Maria Alvarez', email: 'maria@trattoria.local',   role: 'owner' },
  { id: 'user_david', name: 'David Okonkwo', email: 'david@trattoria.local',   role: 'gm' },
  { id: 'user_tim',   name: 'Tim Reyes',     email: 'tim@trattoria.local',     role: 'beverage' },
  { id: 'user_sofia', name: 'Sofia Marchetti', email: 'sofia@trattoria.local', role: 'floor' },
];

export function seedUsers() {
  if (users.size) return;
  const passwordHash = hashPassword(process.env.DEMO_PASSWORD || 'mise');
  for (const u of DEMO) {
    users.set(u.id, { ...u, active: true, passwordHash, dashboards: defaultDashboards(u.role), venue: 'Above Eleven' });
  }
  flush();
}
