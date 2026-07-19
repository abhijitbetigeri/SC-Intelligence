// Durability — local JSON persistence behind the records seam.
// Each collection is a file under ./.data/ (gitignored), loaded on boot and written on
// every mutation. Single-instance durable with zero external services. This SAME
// load()/save() pair is where the InsForge Postgres driver swaps in (see insforge.js):
// the records repository is the only caller, so nothing upstream changes.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), '.data');
export const persistEnabled = () => process.env.PERSIST !== 'off';
const fileFor = (name) => path.join(DIR, `${name}.json`);

export function load(name, fallback) {
  if (!persistEnabled()) return fallback;
  try { return JSON.parse(fs.readFileSync(fileFor(name), 'utf8')); }
  catch { return fallback; }
}

export function save(name, data) {
  if (!persistEnabled()) return;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(fileFor(name), JSON.stringify(data));
  } catch { /* best-effort; stay in-memory if the disk write fails */ }
}
