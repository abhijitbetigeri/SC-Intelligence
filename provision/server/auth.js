// Auth primitives — zero-dependency JWT (HMAC-SHA256) + scrypt password hashing, and the
// role → permitted-dashboard mapping that drives RBAC. Secrets from env, with a dev default
// so the app boots bare.
//
// DEMO MODE: this file is the whole auth story (local JWT + scrypt).
// PRODUCTION: InsForge Auth takes over users/sessions; this stays as the token verifier
// shim or is replaced wholesale — either way `requireAuth` in index.js is the only seam.
import crypto from 'node:crypto';

const SECRET = process.env.AUTH_SECRET || 'dev-insecure-secret-change-me';

// ── dashboards / roles ───────────────────────────────────────────────────────
export const ALL_DASHBOARDS = ['overview', 'stock', 'franchise', 'vips', 'admin'];
export const DASHBOARDS_BY_ROLE = {
  // 'franchise' is the multi-branch view over the Mise agent layer — an owner/GM concern,
  // not a floor or beverage one.
  admin:    ['overview', 'stock', 'franchise', 'vips', 'admin'],
  owner:    ['overview', 'stock', 'franchise', 'vips'],
  gm:       ['overview', 'stock', 'franchise', 'vips'],
  beverage: ['overview', 'stock'],
  floor:    ['overview', 'vips'],
};
export const ROLES = Object.keys(DASHBOARDS_BY_ROLE);
export const defaultDashboards = (role) => [...(DASHBOARDS_BY_ROLE[role] || [])];

// keep only valid keys; the 'admin' dashboard is admin-only
export function sanitizeDashboards(role, dashboards) {
  let d = (dashboards || []).filter((x) => ALL_DASHBOARDS.includes(x));
  if (role !== 'admin') d = d.filter((x) => x !== 'admin');
  return [...new Set(d)];
}

// ── passwords (scrypt) ───────────────────────────────────────────────────────
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// ── JWT (HS256) ──────────────────────────────────────────────────────────────
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
export function signToken(payload, ttlSec = 12 * 3600) {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...payload, iat: now, exp: now + ttlSec })}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  const a = Buffer.from(s), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let body;
  try { body = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); } catch { return null; }
  if (body.exp && Math.floor(Date.now() / 1000) > body.exp) return null;
  return body;
}

// strip the password hash before returning a user over the wire
export function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}
