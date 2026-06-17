'use strict';
const EventEmitter = require('events');

// ── Event bus (SSE subscribers listen here) ──────────────────────────────────
const bus = new EventEmitter();
bus.setMaxListeners(200);

// ── Active sessions ───────────────────────────────────────────────────────────
// Map of sessionId → { id, startedAt, lastSeen, page, productId, productName, source, ip }
const sessions = new Map();

// Rolling ring of session-start timestamps (for "last hour" count, pruned to 2h)
const sessionStarts = []; // [{ sid, at: ISO }]

// ── Daily stats (reset at midnight) ──────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);
let _day = todayStr();
let stats = freshStats();
function freshStats() {
  return {
    visitors: new Set(), // unique session IDs today
    pageViews: 0,
    logins: 0,
    signups: 0,
    orders: 0,
    pix: 0,
    checkouts: 0
  };
}
function checkReset() {
  if (todayStr() !== _day) { _day = todayStr(); stats = freshStats(); }
}

// ── Product view stats (in-memory, lifetime of process) ──────────────────────
// Map of productId → { id, name, views, checkouts, pix }
const products = new Map();

// ── WhatsApp message counters ─────────────────────────────────────────────────
const wa = { sent: 0, received: 0 };

// ── Event buffer (newest first, max 300) ─────────────────────────────────────
const evBuf = [];
const EV_MAX = 300;
function pushEv(type, data) {
  evBuf.unshift({ type, data: data || {}, at: new Date().toISOString() });
  if (evBuf.length > EV_MAX) evBuf.length = EV_MAX;
}

// ── Emit throttle (batch updates within 400ms) ───────────────────────────────
let _emitTimer = null;
function emit() {
  if (_emitTimer) return;
  _emitTimer = setTimeout(() => { _emitTimer = null; bus.emit('snap', snap()); }, 400);
}

// ── Traffic source detection ──────────────────────────────────────────────────
const SRC = [
  [/facebook|fb\.com/i, 'Facebook'],
  [/instagram/i, 'Instagram'],
  [/google/i, 'Google'],
  [/tiktok/i, 'TikTok'],
  [/wa\.me|whatsapp/i, 'WhatsApp'],
  [/youtube/i, 'YouTube'],
  [/twitter|x\.com/i, 'Twitter/X'],
];
function getSource(ref, utm) {
  if (utm) return String(utm).slice(0, 30);
  if (!ref) return 'Direto';
  for (const [re, label] of SRC) if (re.test(ref)) return label;
  try { return new URL(ref).hostname.replace('www.', '').slice(0, 30); } catch { return 'Outro'; }
}

// ── Session cleanup (every 60s) ───────────────────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - 3 * 60 * 1000; // 3 minutes inactive
  for (const [id, s] of sessions) {
    if (new Date(s.lastSeen).getTime() < cutoff) sessions.delete(id);
  }
  // Prune sessionStarts older than 2 hours
  const h2ago = Date.now() - 2 * 60 * 60 * 1000;
  while (sessionStarts.length && new Date(sessionStarts[0].at).getTime() < h2ago) {
    sessionStarts.shift();
  }
}, 60_000);

// ── Public API ────────────────────────────────────────────────────────────────

function heartbeat({ sessionId, page, productId, productName, referrer, utmSource, ip }) {
  if (!sessionId) return;
  checkReset();
  const now = new Date().toISOString();
  const isNew = !sessions.has(sessionId);
  const source = sessions.get(sessionId)?.source || getSource(referrer, utmSource);
  const cleanIp = ip ? String(ip).replace('::ffff:', '').replace('::1', '127.0.0.1') : null;

  if (isNew) {
    stats.visitors.add(sessionId);
    sessionStarts.push({ sid: sessionId, at: now });
    pushEv('visitor_enter', { page: page || '/', source, sessionId: sessionId.slice(0, 8) });
  }

  sessions.set(sessionId, {
    id: sessionId,
    startedAt: sessions.get(sessionId)?.startedAt || now,
    lastSeen: now,
    page: page || '/',
    productId: productId || null,
    productName: productName || null,
    source,
    ip: cleanIp
  });

  stats.pageViews++;

  if (productId) {
    if (!products.has(productId)) {
      products.set(productId, { id: productId, name: productName || productId, views: 0, checkouts: 0, pix: 0 });
    }
    const p = products.get(productId);
    p.views++;
    if (productName && p.name === productId) p.name = productName;
    // Prevent unbounded growth: keep top 200 products
    if (products.size > 200) {
      const sorted = [...products.entries()].sort((a, b) => b[1].views - a[1].views);
      sorted.slice(150).forEach(([k]) => products.delete(k));
    }
  }

  emit();
}

function record(type, data = {}) {
  checkReset();
  if (type === 'login')          stats.logins++;
  if (type === 'signup')         stats.signups++;
  if (type === 'order_created')  stats.orders++;
  if (type === 'pix_created')    stats.pix++;
  if (type === 'checkout_start') {
    stats.checkouts++;
    if (data.productId && products.has(data.productId)) products.get(data.productId).checkouts++;
  }
  if (type === 'pix_created' && data.productId && products.has(data.productId)) {
    products.get(data.productId).pix++;
  }
  if (type === 'wa_sent')     wa.sent++;
  if (type === 'wa_received') wa.received++;
  pushEv(type, data);
  emit();
}

function snap() {
  checkReset();
  const now = Date.now();
  const h1ago = now - 60 * 60 * 1000;
  const lastHour = sessionStarts.filter(s => new Date(s.at).getTime() > h1ago).length;
  const uniq = stats.visitors.size;
  return {
    activeNow: sessions.size,
    visitorsToday: uniq,
    visitorsLastHour: lastHour,
    pageViewsToday: stats.pageViews,
    ordersToday: stats.orders,
    pixToday: stats.pix,
    loginsToday: stats.logins,
    signupsToday: stats.signups,
    checkoutsToday: stats.checkouts,
    conversionRate: uniq > 0 ? +(stats.pix / uniq * 100).toFixed(1) : 0,
    sessions: Array.from(sessions.values()).sort((a, b) => (b.lastSeen > a.lastSeen ? 1 : -1)),
    events: evBuf.slice(0, 100),
    products: Array.from(products.values()).sort((a, b) => b.views - a.views).slice(0, 15),
    wa: { ...wa },
    date: _day
  };
}

module.exports = { heartbeat, record, snap, bus };
