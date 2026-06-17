const MAX = 2000;
const store = { app: [], errors: [], whatsapp: [], deploy: [] };
const orig = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console)
};

const fmt = (a) => a.map(v => v instanceof Error ? v.stack : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)).join(' ');

const push = (bucket, level, msg) => {
  const entry = { ts: Date.now(), level, msg };
  store[bucket] = [entry, ...store[bucket]].slice(0, MAX);
};

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
};

console.warn = (...a) => {
  orig.warn(...a);
  push('app', 'warn', fmt(a));
};

module.exports = {
  get: (type) => [...(store[type] || store.app)],
  deploy: (msg) => {
    orig.log('[DEPLOY]', msg);
    push('deploy', 'info', msg);
    push('app', 'info', '[DEPLOY] ' + msg);
  }
};
