// Client for the JSON API. `??` (not `||`) so an explicit empty VITE_API_URL means
// "same origin" — which is what the production build uses, since Express serves this SPA.
// Unset (dev) falls back to the dev backend port.
import { getToken } from './auth.js';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8788';

async function j(path, { timeout = 15000, method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    const tok = getToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    if (!r.ok) {
      let msg;
      try { msg = (await r.json()).error; } catch { /* ignore */ }
      throw new Error(msg || `HTTP ${r.status}`);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export const health = () => j('/api/health');
export const getOverview = () => j('/api/overview');

// stock + purchasing
export const getStock = () => j('/api/stock');
export const reorder = (sku) => j(`/api/stock/${encodeURIComponent(sku)}/reorder`, { method: 'POST' });
export const getPos = () => j('/api/pos');
export const approvePo = (id) => j(`/api/po/${encodeURIComponent(id)}/approve`, { method: 'POST' });
export const cancelPo = (id) => j(`/api/po/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
export const getRule = () => j('/api/rules/reorder');
export const saveRule = (rule) => j('/api/rules/reorder', { method: 'PUT', body: rule });

// franchise (Mise agent layer — read-only)
export const getFranchise = () => j('/api/franchise');

// guests
export const getVips = () => j('/api/vips');
export const getGuests = () => j('/api/guests');

// co-pilot + seams
export const askCopilot = (messages, ctx = {}) => j('/api/copilot', { method: 'POST', body: { messages, ...ctx }, timeout: 60000 });
export const getSeams = () => j('/api/seams');

export const API_BASE = BASE;
