'use strict';
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// ── Event bus ─────────────────────────────────────────────────────────────────
const bus = new EventEmitter();
bus.setMaxListeners(200);

// ── Paths ─────────────────────────────────────────────────────────────────────
const ANALYTICS_DIR = path.join(__dirname, 'data', 'analytics');
const EV_DIR        = path.join(ANALYTICS_DIR, 'events');
const DAILY_F       = path.join(ANALYTICS_DIR, 'daily.json');
const PRODS_F       = path.join(ANALYTICS_DIR, 'products.json');
const LIFE_F        = path.join(ANALYTICS_DIR, 'lifetime.json');

if (!fs.existsSync(ANALYTICS_DIR)) fs.mkdirSync(ANALYTICS_DIR, { recursive: true });
if (!fs.existsSync(EV_DIR))        fs.mkdirSync(EV_DIR, { recursive: true });

// ── Disk helpers ──────────────────────────────────────────────────────────────
const readJ  = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return d; } };
const writeJ = (p, v) => {
  try {
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(v), 'utf-8');
    fs.renameSync(tmp, p);
  } catch {}
};

function blankDay() {
  return { visitors: 0, pageViews: 0, logins: 0, signups: 0, orders: 0, pix: 0, checkouts: 0, byHour: {}, sources: {}, visitorIds: [] };
}

// ── Load persisted data ───────────────────────────────────────────────────────
const dailyDB  = readJ(DAILY_F, {});
const prodStore = readJ(PRODS_F, {});
const lifetime = readJ(LIFE_F, { visitors: 0, pageViews: 0, logins: 0, signups: 0, orders: 0, pix: 0, checkouts: 0, wa: { sent: 0, received: 0 } });
if (!lifetime.wa) lifetime.wa = { sent: 0, received: 0 };

// ── Date helpers ──────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);
const hourStr  = () => String(new Date().getHours());

let _day = todayStr();

function dayRec(dateStr) {
  if (!dailyDB[dateStr]) dailyDB[dateStr] = blankDay();
  return dailyDB[dateStr];
}

// ── Restore today's in-memory state from disk ─────────────────────────────────
let dayData = dayRec(_day);
const visitorSet = new Set(dayData.visitorIds || []);

let stats = {
  pageViews:  dayData.pageViews,
  logins:     dayData.logins,
  signups:    dayData.signups,
  orders:     dayData.orders,
  pix:        dayData.pix,
  checkouts:  dayData.checkouts,
};

// ── In-memory-only (ephemeral, OK to reset on restart) ────────────────────────
const sessions      = new Map();
const sessionStarts = [];
const wa            = lifetime.wa;
const products      = new Map(Object.entries(prodStore));

// ── Dirty flags ───────────────────────────────────────────────────────────────
let _dirtyDaily    = false;
let _dirtyProducts = false;
let _dirtyLifetime = false;

// ── Flush to disk (atomic write via tmp file) ─────────────────────────────────
function flush() {
  if (_dirtyDaily) {
    dayData.visitors  = visitorSet.size;
    dayData.pageViews = stats.pageViews;
    dayData.logins    = stats.logins;
    dayData.signups   = stats.signups;
    dayData.orders    = stats.orders;
    dayData.pix       = stats.pix;
    dayData.checkouts = stats.checkouts;
    dayData.visitorIds = [...visitorSet].slice(0, 10000);
    writeJ(DAILY_F, dailyDB);
    _dirtyDaily = false;
  }
  if (_dirtyProducts) {
    writeJ(PRODS_F, Object.fromEntries(products));
    _dirtyProducts = false;
  }
  if (_dirtyLifetime) {
    writeJ(LIFE_F, lifetime);
    _dirtyLifetime = false;
  }
}

// Flush every 5 seconds if dirty
setInterval(flush, 5_000).unref();

// Graceful shutdown — ensure data is written before process dies
process.on('exit', flush);
['SIGTERM', 'SIGINT'].forEach(sig => process.on(sig, () => { flush(); process.exit(0); }));

// ── Midnight reset ────────────────────────────────────────────────────────────
function checkReset() {
  const d = todayStr();
  if (d === _day) return;

  flush(); // persist the outgoing day first

  _day    = d;
  dayData = dayRec(_day);

  visitorSet.clear();
  (dayData.visitorIds || []).forEach(id => visitorSet.add(id));

  stats = {
    pageViews:  dayData.pageViews,
    logins:     dayData.logins,
    signups:    dayData.signups,
    orders:     dayData.orders,
    pix:        dayData.pix,
    checkouts:  dayData.checkouts,
  };
}

// ── Event buffer ──────────────────────────────────────────────────────────────
const evBuf  = [];
const EV_MAX = 300;

function pushEv(type, data) {
  const ev = { type, data: data || {}, at: new Date().toISOString() };
  evBuf.unshift(ev);
  if (evBuf.length > EV_MAX) evBuf.length = EV_MAX;

  // Business events only (not raw heartbeats) go to the daily file
  const SKIP = new Set(['visitor_enter']); // visitor_enter is still persisted
  if (!SKIP.has(type)) {
    try { fs.appendFileSync(path.join(EV_DIR, `${todayStr()}.jsonl`), JSON.stringify(ev) + '\n', 'utf-8'); } catch {}
  }
}

// ── Prune old event files (keep last 30 days) ─────────────────────────────────
function pruneEvents() {
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    fs.readdirSync(EV_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ f, mt: fs.statSync(path.join(EV_DIR, f)).mtimeMs }))
      .filter(({ mt }) => mt < cutoff)
      .forEach(({ f }) => { try { fs.unlinkSync(path.join(EV_DIR, f)); } catch {} });
  } catch {}
}
setInterval(pruneEvents, 6 * 60 * 60 * 1000).unref();

// ── Traffic source detection ──────────────────────────────────────────────────
const SRC_RE = [
  [/facebook|fb\.com/i, 'Facebook'],
  [/instagram/i,        'Instagram'],
  [/google/i,           'Google'],
  [/tiktok/i,           'TikTok'],
  [/wa\.me|whatsapp/i,  'WhatsApp'],
  [/youtube/i,          'YouTube'],
  [/twitter|x\.com/i,   'Twitter/X'],
];
function getSource(ref, utm) {
  if (utm) return String(utm).slice(0, 30);
  if (!ref) return 'Direto';
  for (const [re, label] of SRC_RE) if (re.test(ref)) return label;
  try { return new URL(ref).hostname.replace('www.', '').slice(0, 30); } catch { return 'Outro'; }
}

// ── Emit throttle (batch SSE updates within 400ms) ────────────────────────────
let _emitTimer = null;
function emit() {
  if (_emitTimer) return;
  _emitTimer = setTimeout(() => { _emitTimer = null; bus.emit('snap', snap()); }, 400);
}

// ── Session cleanup (every 60s) ────────────────────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - 3 * 60 * 1000;
  for (const [id, s] of sessions) {
    if (new Date(s.lastSeen).getTime() < cutoff) sessions.delete(id);
  }
  const h2ago = Date.now() - 2 * 60 * 60 * 1000;
  while (sessionStarts.length && new Date(sessionStarts[0].at).getTime() < h2ago) sessionStarts.shift();
}, 60_000).unref();

// ── Public API ────────────────────────────────────────────────────────────────

function heartbeat({ sessionId, page, productId, productName, referrer, utmSource, ip }) {
  if (!sessionId) return;
  checkReset();

  const now    = new Date().toISOString();
  const isNew  = !sessions.has(sessionId);
  const source = sessions.get(sessionId)?.source || getSource(referrer, utmSource);
  const cleanIp = ip ? String(ip).replace('::ffff:', '').replace('::1', '127.0.0.1') : null;

  if (isNew) {
    visitorSet.add(sessionId);
    sessionStarts.push({ sid: sessionId, at: now });

    // Hourly + source breakdown (persisted via dayData)
    const h = hourStr();
    dayData.byHour[h]     = (dayData.byHour[h] || 0) + 1;
    dayData.sources[source] = (dayData.sources[source] || 0) + 1;

    lifetime.visitors++;
    _dirtyLifetime = true;

    pushEv('visitor_enter', { page: page || '/', source, sessionId: sessionId.slice(0, 8) });
    _dirtyDaily = true;
  }

  sessions.set(sessionId, {
    id:          sessionId,
    startedAt:   sessions.get(sessionId)?.startedAt || now,
    lastSeen:    now,
    page:        page || '/',
    productId:   productId || null,
    productName: productName || null,
    source,
    ip:          cleanIp
  });

  stats.pageViews++;
  lifetime.pageViews++;
  _dirtyDaily    = true;
  _dirtyLifetime = true;

  if (productId) {
    if (!products.has(productId)) {
      products.set(productId, { id: productId, name: productName || productId, views: 0, checkouts: 0, pix: 0 });
    }
    const p = products.get(productId);
    p.views++;
    if (productName && p.name === productId) p.name = productName;
    _dirtyProducts = true;

    // Keep top 200 products
    if (products.size > 200) {
      const sorted = [...products.entries()].sort((a, b) => b[1].views - a[1].views);
      sorted.slice(150).forEach(([k]) => products.delete(k));
    }
  }

  emit();
}

function record(type, data = {}) {
  checkReset();

  if (type === 'login')          { stats.logins++;    lifetime.logins++;    _dirtyLifetime = true; }
  if (type === 'signup')         { stats.signups++;   lifetime.signups++;   _dirtyLifetime = true; }
  if (type === 'order_created')  { stats.orders++;    lifetime.orders++;    _dirtyLifetime = true; }
  if (type === 'pix_created')    { stats.pix++;       lifetime.pix++;       _dirtyLifetime = true; }
  if (type === 'checkout_start') {
    stats.checkouts++;
    lifetime.checkouts++;
    _dirtyLifetime = true;
    if (data.productId && products.has(data.productId)) {
      products.get(data.productId).checkouts++;
      _dirtyProducts = true;
    }
  }
  if (type === 'pix_created' && data.productId && products.has(data.productId)) {
    products.get(data.productId).pix++;
    _dirtyProducts = true;
  }
  if (type === 'wa_sent')     { wa.sent++;     _dirtyLifetime = true; }
  if (type === 'wa_received') { wa.received++; _dirtyLifetime = true; }

  _dirtyDaily = true;
  pushEv(type, data);
  emit();
}

function snap() {
  checkReset();
  const now   = Date.now();
  const h1ago = now - 60 * 60 * 1000;
  const lastHour = sessionStarts.filter(s => new Date(s.at).getTime() > h1ago).length;
  const uniq  = visitorSet.size;
  return {
    activeNow:        sessions.size,
    visitorsToday:    uniq,
    visitorsLastHour: lastHour,
    pageViewsToday:   stats.pageViews,
    ordersToday:      stats.orders,
    pixToday:         stats.pix,
    loginsToday:      stats.logins,
    signupsToday:     stats.signups,
    checkoutsToday:   stats.checkouts,
    conversionRate:   uniq > 0 ? +(stats.pix / uniq * 100).toFixed(1) : 0,
    sessions:  Array.from(sessions.values()).sort((a, b) => (b.lastSeen > a.lastSeen ? 1 : -1)),
    events:    evBuf.slice(0, 100),
    products:  Array.from(products.values()).sort((a, b) => b.views - a.views).slice(0, 15),
    wa:        { ...wa },
    date:      _day,
    lifetime:  { ...lifetime },
  };
}

// ── History reader (used by /api/admin/analytics) ─────────────────────────────
function getHistory(days) {
  const result = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const rec     = dailyDB[dateStr] || blankDay();
    result.push({
      date:      dateStr,
      visitors:  dateStr === _day ? visitorSet.size : rec.visitors,
      pageViews: dateStr === _day ? stats.pageViews  : rec.pageViews,
      logins:    dateStr === _day ? stats.logins      : rec.logins,
      signups:   dateStr === _day ? stats.signups     : rec.signups,
      orders:    dateStr === _day ? stats.orders      : rec.orders,
      pix:       dateStr === _day ? stats.pix         : rec.pix,
      checkouts: dateStr === _day ? stats.checkouts   : rec.checkouts,
      byHour:    dateStr === _day ? { ...dayData.byHour }   : rec.byHour || {},
      sources:   dateStr === _day ? { ...dayData.sources }  : rec.sources || {},
    });
  }
  return result; // newest first
}

module.exports = { heartbeat, record, snap, bus, getHistory, products, lifetime };
