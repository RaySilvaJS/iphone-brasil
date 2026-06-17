'use strict';
const fs = require('fs');
const path = require('path');

// ── In-memory buffers (fast API access) ──────────────────────────────────────
const MAX = 2000;
const store = { app: [], errors: [], whatsapp: [], deploy: [] };

// ── File logging ──────────────────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, 'logs');
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per file before rotation
const MAX_ROTATIONS = 7;                 // keep last 7 rotated files per bucket

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// Returns current size of a file (0 if missing)
const fileSize = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };

// Rotate: rename current → timestamped, prune old rotations
const rotate = (bucket) => {
  const current = path.join(LOG_DIR, `${bucket}.log`);
  if (!fs.existsSync(current)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.renameSync(current, path.join(LOG_DIR, `${bucket}.${stamp}.log`));

  // Prune oldest rotations beyond MAX_ROTATIONS
  try {
    const pattern = new RegExp(`^${bucket}\\.\\d{4}.+\\.log$`);
    const old = fs.readdirSync(LOG_DIR)
      .filter(f => pattern.test(f))
      .map(f => ({ f, mt: fs.statSync(path.join(LOG_DIR, f)).mtimeMs }))
      .sort((a, b) => a.mt - b.mt);
    old.slice(0, Math.max(0, old.length - MAX_ROTATIONS))
       .forEach(({ f }) => { try { fs.unlinkSync(path.join(LOG_DIR, f)); } catch {} });
  } catch {}
};

// Append one JSON-Lines entry to disk
const writeFile = (bucket, entry) => {
  try {
    const filePath = path.join(LOG_DIR, `${bucket}.log`);
    if (fileSize(filePath) >= MAX_FILE_BYTES) rotate(bucket);
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {}
};

// ── Core helpers ──────────────────────────────────────────────────────────────
const orig = {
  log:   console.log.bind(console),
  error: console.error.bind(console),
  warn:  console.warn.bind(console)
};

const fmt = (a) =>
  a.map(v => v instanceof Error ? v.stack : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)).join(' ');

const push = (bucket, level, msg) => {
  const entry = { ts: Date.now(), level, msg };
  store[bucket] = [entry, ...store[bucket]].slice(0, MAX);
  writeFile(bucket, entry);
};

// ── console overrides ────────────────────────────────────────────────────────
console.log = (...a) => {
  orig.log(...a);
  const m = fmt(a);
  push('app', 'info', m);
  if (/^>>|[Ww]hats[Aa]pp|[Bb]aileys|\[WA\]/.test(m)) push('whatsapp', 'info', m);
};

console.error = (...a) => {
  orig.error(...a);
  const m = fmt(a);
  push('errors', 'error', m);
  push('app', 'error', m);
  try { getAlerts()?.trackError(); } catch {}
};

console.warn = (...a) => {
  orig.warn(...a);
  const m = fmt(a);
  push('app', 'warn', m);
};

// ── Alert integration (lazy to avoid circular deps) ──────────────────────────
const getAlerts = () => { try { return require('./alerts'); } catch { return null; } };

// ── Public API ────────────────────────────────────────────────────────────────
module.exports = {
  get: (type) => [...(store[type] || store.app)],

  deploy: (msg) => {
    orig.log('[DEPLOY]', msg);
    push('deploy', 'info', msg);
    push('app', 'info', '[DEPLOY] ' + msg);
  },

  // Read last N lines from the rotated log files (for "history" queries)
  getFromDisk: (bucket, limit = 500) => {
    try {
      const filePath = path.join(LOG_DIR, `${bucket}.log`);
      if (!fs.existsSync(filePath)) return [];
      const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean);
      return lines.slice(-limit).reverse().map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
  },

  LOG_DIR
};
