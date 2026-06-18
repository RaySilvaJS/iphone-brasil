'use strict';
const http   = require('http');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const EventEmitter = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(200);

// ── Paths ─────────────────────────────────────────────────────────────────────
const ANALYTICS_DIR = path.join(__dirname, 'data', 'analytics');
const EV_DIR        = path.join(ANALYTICS_DIR, 'events');
const DAILY_F       = path.join(ANALYTICS_DIR, 'daily.json');
const PRODS_F       = path.join(ANALYTICS_DIR, 'products.json');
const LIFE_F        = path.join(ANALYTICS_DIR, 'lifetime.json');
const VISITORS_F    = path.join(ANALYTICS_DIR, 'visitors.json');
const CARTS_F       = path.join(ANALYTICS_DIR, 'carts.json');

[ANALYTICS_DIR, EV_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Disk helpers ──────────────────────────────────────────────────────────────
const readJ  = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return d; } };
const writeJ = (p, v) => {
  try {
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(v), 'utf-8');
    fs.renameSync(tmp, p);
  } catch {}
};

// ── UA Parser ─────────────────────────────────────────────────────────────────
function parseUA(ua = '') {
  let device = 'Desktop';
  if (/iPad|Tablet|PlayBook/i.test(ua)) device = 'Tablet';
  else if (/Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) device = 'Mobile';

  let browser = 'Outro';
  if (/SamsungBrowser/i.test(ua))    browser = 'Samsung';
  else if (/Edg\//i.test(ua))        browser = 'Edge';
  else if (/OPR|Opera/i.test(ua))    browser = 'Opera';
  else if (/UCBrowser/i.test(ua))    browser = 'UC Browser';
  else if (/Chromium/i.test(ua))     browser = 'Chromium';
  else if (/Chrome/i.test(ua))       browser = 'Chrome';
  else if (/Firefox/i.test(ua))      browser = 'Firefox';
  else if (/Safari/i.test(ua))       browser = 'Safari';
  else if (/MSIE|Trident/i.test(ua)) browser = 'IE';

  let os = 'Outro';
  if (/Windows NT/i.test(ua))            os = 'Windows';
  else if (/Android/i.test(ua))          os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/CrOS/i.test(ua))             os = 'ChromeOS';
  else if (/Mac OS X/i.test(ua))         os = 'macOS';
  else if (/Linux/i.test(ua))            os = 'Linux';

  return { device, browser, os };
}

// ── Geo Lookup ────────────────────────────────────────────────────────────────
const geoCache = new Map();
const geoQueue = [];
let geoRunning = false;
const PRIVATE  = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fd)/;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function processGeoQueue() {
  if (geoRunning) return;
  geoRunning = true;
  while (geoQueue.length) {
    const { ip, cb } = geoQueue.shift();
    if (PRIVATE.test(ip)) { cb(null); continue; }
    const hit = geoCache.get(ip);
    if (hit && Date.now() - hit.at < 24 * 60 * 60 * 1000) { cb(hit.data); continue; }
    try {
      const data = await httpGet(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,timezone`);
      if (data.status === 'success') {
        geoCache.set(ip, { data, at: Date.now() });
        cb(data);
      } else cb(null);
    } catch { cb(null); }
    await new Promise(r => setTimeout(r, 1400)); // ~42 req/min (free limit: 45)
  }
  geoRunning = false;
}

function lookupGeo(ip, cb) {
  if (!ip || PRIVATE.test(ip)) { cb(null); return; }
  const hit = geoCache.get(ip);
  if (hit && Date.now() - hit.at < 24 * 60 * 60 * 1000) { cb(hit.data); return; }
  geoQueue.push({ ip, cb });
  processGeoQueue().catch(() => {});
}

// ── Visitor fingerprint ───────────────────────────────────────────────────────
function fingerprint(ip, ua) {
  return crypto.createHash('sha256').update((ip || '') + '|' + (ua || '')).digest('hex').slice(0, 16);
}

// ── Data schemas ──────────────────────────────────────────────────────────────
function blankDay() {
  return {
    visitors: 0, pageViews: 0, logins: 0, signups: 0,
    orders: 0, pix: 0, checkouts: 0, pixPaid: 0,
    clickBuy: 0, clickWa: 0,
    clickLogin: 0, clickSignup: 0, clickCheckout: 0, clickCalcFrete: 0,
    cartAdds: 0,
    byHour: {}, sources: {}, utmSources: {},
    devices: {}, browsers: {}, os: {}, countries: {}, cities: {},
    visitorIds: []
  };
}

// ── Load all persisted data ───────────────────────────────────────────────────
const dailyDB      = readJ(DAILY_F, {});
const prodStore    = readJ(PRODS_F, {});
const lifetime     = readJ(LIFE_F, {
  visitors: 0, pageViews: 0, logins: 0, signups: 0, orders: 0, pix: 0,
  checkouts: 0, pixPaid: 0, clickBuy: 0, clickWa: 0,
  clickLogin: 0, clickSignup: 0, clickCheckout: 0, clickCalcFrete: 0,
  cartAdds: 0, wa: { sent: 0, received: 0 }
});
if (!lifetime.wa) lifetime.wa = { sent: 0, received: 0 };

const visitorsStore  = readJ(VISITORS_F, {});
const abandonedCarts = readJ(CARTS_F, []);

// ── Date helpers ──────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);
const hourStr  = () => String(new Date().getHours());

let _day = todayStr();
function dayRec(d) { if (!dailyDB[d]) dailyDB[d] = blankDay(); return dailyDB[d]; }

let dayData    = dayRec(_day);
const visitorSet = new Set(dayData.visitorIds || []);

let stats = {
  pageViews:       dayData.pageViews,       logins:          dayData.logins,
  signups:         dayData.signups,         orders:          dayData.orders,
  pix:             dayData.pix,             checkouts:       dayData.checkouts,
  pixPaid:         dayData.pixPaid        || 0,
  clickBuy:        dayData.clickBuy       || 0,
  clickWa:         dayData.clickWa        || 0,
  clickLogin:      dayData.clickLogin     || 0,
  clickSignup:     dayData.clickSignup    || 0,
  clickCheckout:   dayData.clickCheckout  || 0,
  clickCalcFrete:  dayData.clickCalcFrete || 0,
  cartAdds:        dayData.cartAdds       || 0,
};

const sessions      = new Map();
const sessionStarts = [];
const products      = new Map(Object.entries(prodStore));
const visitors      = new Map(Object.entries(visitorsStore));
const carts         = new Map(); // sessionId → active cart state (in-memory only)
const wa            = lifetime.wa;

// ── Dirty flags & debounced flush ─────────────────────────────────────────────
let _dirtyDaily = false, _dirtyProducts = false, _dirtyLifetime = false, _dirtyVisitors = false, _dirtyCarts = false;

function flush() {
  if (_dirtyDaily) {
    Object.assign(dayData, {
      visitors:       visitorSet.size,      pageViews:      stats.pageViews,
      logins:         stats.logins,         signups:        stats.signups,
      orders:         stats.orders,         pix:            stats.pix,
      checkouts:      stats.checkouts,      pixPaid:        stats.pixPaid,
      clickBuy:       stats.clickBuy,       clickWa:        stats.clickWa,
      clickLogin:     stats.clickLogin,     clickSignup:    stats.clickSignup,
      clickCheckout:  stats.clickCheckout,  clickCalcFrete: stats.clickCalcFrete,
      cartAdds:       stats.cartAdds,
      visitorIds: [...visitorSet].slice(0, 10000),
    });
    writeJ(DAILY_F, dailyDB);
    _dirtyDaily = false;
  }
  if (_dirtyProducts) { writeJ(PRODS_F, Object.fromEntries(products)); _dirtyProducts = false; }
  if (_dirtyLifetime) { writeJ(LIFE_F, lifetime);  _dirtyLifetime = false; }
  if (_dirtyVisitors) {
    const all = [...visitors.entries()];
    const obj = all.length > 10000
      ? Object.fromEntries(all.sort((a, b) => (b[1].lastSeen > a[1].lastSeen ? 1 : -1)).slice(0, 10000))
      : Object.fromEntries(all);
    writeJ(VISITORS_F, obj);
    _dirtyVisitors = false;
  }
  if (_dirtyCarts) { writeJ(CARTS_F, abandonedCarts.slice(0, 500)); _dirtyCarts = false; }
}

setInterval(flush, 5000).unref();
process.on('exit', flush);
['SIGTERM', 'SIGINT'].forEach(sig => process.on(sig, () => { flush(); process.exit(0); }));

// ── Midnight reset ────────────────────────────────────────────────────────────
function checkReset() {
  const d = todayStr();
  if (d === _day) return;
  flush();
  _day    = d;
  dayData = dayRec(_day);
  visitorSet.clear();
  (dayData.visitorIds || []).forEach(id => visitorSet.add(id));
  stats = {
    pageViews:       dayData.pageViews,       logins:          dayData.logins,
    signups:         dayData.signups,         orders:          dayData.orders,
    pix:             dayData.pix,             checkouts:       dayData.checkouts,
    pixPaid:         dayData.pixPaid        || 0,
    clickBuy:        dayData.clickBuy       || 0,
    clickWa:         dayData.clickWa        || 0,
    clickLogin:      dayData.clickLogin     || 0,
    clickSignup:     dayData.clickSignup    || 0,
    clickCheckout:   dayData.clickCheckout  || 0,
    clickCalcFrete:  dayData.clickCalcFrete || 0,
    cartAdds:        dayData.cartAdds       || 0,
  };
}

// ── Event buffer ──────────────────────────────────────────────────────────────
const evBuf = [];
const EV_MAX = 500;
function pushEv(type, data) {
  const ev = { type, data: data || {}, at: new Date().toISOString() };
  evBuf.unshift(ev);
  if (evBuf.length > EV_MAX) evBuf.length = EV_MAX;
  try { fs.appendFileSync(path.join(EV_DIR, `${todayStr()}.jsonl`), JSON.stringify(ev) + '\n', 'utf-8'); } catch {}
}

setInterval(() => {
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    fs.readdirSync(EV_DIR).filter(f => f.endsWith('.jsonl'))
      .map(f => ({ f, mt: fs.statSync(path.join(EV_DIR, f)).mtimeMs }))
      .filter(({ mt }) => mt < cutoff)
      .forEach(({ f }) => { try { fs.unlinkSync(path.join(EV_DIR, f)); } catch {} });
  } catch {}
}, 6 * 60 * 60 * 1000).unref();

// ── Traffic source detection ──────────────────────────────────────────────────
const SRC_RE = [
  [/facebook|fb\.com/i, 'Facebook'],    [/instagram/i, 'Instagram'],
  [/google/i, 'Google'],                [/tiktok/i, 'TikTok'],
  [/wa\.me|whatsapp/i, 'WhatsApp'],     [/youtube/i, 'YouTube'],
  [/twitter|x\.com/i, 'Twitter/X'],
];
function getSource(ref, utm) {
  if (utm) {
    if (/facebook|fb/i.test(utm)) return 'Facebook Ads';
    if (/instagram/i.test(utm))   return 'Instagram';
    if (/google/i.test(utm))      return 'Google Ads';
    if (/tiktok/i.test(utm))      return 'TikTok';
    return String(utm).slice(0, 30);
  }
  if (!ref) return 'Direto';
  for (const [re, label] of SRC_RE) if (re.test(ref)) return label;
  try { return new URL(ref).hostname.replace('www.', '').slice(0, 30); } catch { return 'Outro'; }
}

// ── Emit throttle ─────────────────────────────────────────────────────────────
let _emitTimer = null;
function emit() {
  if (_emitTimer) return;
  _emitTimer = setTimeout(() => { _emitTimer = null; bus.emit('snap', snap()); }, 400);
}

// ── Session cleanup ────────────────────────────────────────────────────────────
setInterval(() => {
  const cutoff     = Date.now() - 3  * 60 * 1000;
  const cartCutoff = Date.now() - 5  * 60 * 1000; // cart abandoned after 5 min inactive
  for (const [id, s] of sessions) {
    if (new Date(s.lastSeen).getTime() < cutoff) {
      // Detect abandoned cart: session expired while having an active cart
      if (carts.has(id)) {
        const c = carts.get(id);
        if (c.items && c.items.length > 0 && new Date(c.lastUpdated).getTime() < cartCutoff) {
          abandonedCarts.unshift({ ...c, abandonedAt: new Date().toISOString() });
          if (abandonedCarts.length > 500) abandonedCarts.length = 500;
          _dirtyCarts = true;
        }
        carts.delete(id);
      }
      sessions.delete(id);
    }
  }
  const h2ago = Date.now() - 2 * 60 * 60 * 1000;
  while (sessionStarts.length && new Date(sessionStarts[0].at).getTime() < h2ago) sessionStarts.shift();
}, 60_000).unref();

// ── heartbeat ─────────────────────────────────────────────────────────────────
function heartbeat({
  sessionId, page, productId, productName, referrer,
  utmSource, utmMedium, utmCampaign, utmContent, utmTerm,
  ip, ua, language, timezone, screenW, screenH
}) {
  if (!sessionId) return;
  checkReset();

  const now      = new Date().toISOString();
  const isNew    = !sessions.has(sessionId);
  const existing = sessions.get(sessionId);
  const source   = existing?.source || getSource(referrer, utmSource);
  const cleanIp  = ip ? String(ip).replace('::ffff:', '').replace('::1', '127.0.0.1') : null;
  const { device, browser, os } = parseUA(ua || '');
  const fp = fingerprint(cleanIp, ua || '');

  if (isNew) {
    visitorSet.add(sessionId);
    sessionStarts.push({ sid: sessionId, at: now });

    const h = hourStr();
    dayData.byHour[h]          = (dayData.byHour[h] || 0) + 1;
    dayData.sources[source]    = (dayData.sources[source] || 0) + 1;
    dayData.devices[device]    = (dayData.devices[device] || 0) + 1;
    dayData.browsers[browser]  = (dayData.browsers[browser] || 0) + 1;
    dayData.os[os]             = (dayData.os[os] || 0) + 1;
    if (utmSource) dayData.utmSources[utmSource] = (dayData.utmSources[utmSource] || 0) + 1;

    lifetime.visitors++;
    _dirtyLifetime = true;

    // Visitor profile
    if (visitors.has(fp)) {
      const v = visitors.get(fp);
      v.lastSeen   = now;
      v.visitCount = (v.visitCount || 1) + 1;
      v.device = device; v.browser = browser; v.os = os;
      if (language) v.language = language;
      if (timezone) v.timezone = timezone;
      if (screenW)  v.screenW  = screenW;
      if (screenH)  v.screenH  = screenH;
      if (!v.sessions) v.sessions = [];
      if (!v.sessions.includes(sessionId)) v.sessions.unshift(sessionId);
      if (v.sessions.length > 20) v.sessions.length = 20;
    } else {
      visitors.set(fp, {
        fp, ip: cleanIp, device, browser, os,
        language: language || null, timezone: timezone || null,
        screenW: screenW || null, screenH: screenH || null,
        firstSeen: now, lastSeen: now, visitCount: 1, sessions: [sessionId],
        utmSource: utmSource || null, utmMedium: utmMedium || null,
        utmCampaign: utmCampaign || null, utmContent: utmContent || null,
        country: null, countryCode: null, region: null, city: null,
      });
    }
    _dirtyVisitors = true;

    // Async geo lookup — non-blocking
    if (cleanIp) {
      lookupGeo(cleanIp, geo => {
        if (!geo) return;
        const v = visitors.get(fp);
        if (v) {
          v.country = geo.country || null; v.countryCode = geo.countryCode || null;
          v.region  = geo.regionName || null; v.city = geo.city || null;
          if (geo.timezone && !v.timezone) v.timezone = geo.timezone;
          _dirtyVisitors = true;
        }
        if (geo.countryCode) dayData.countries[geo.countryCode] = (dayData.countries[geo.countryCode] || 0) + 1;
        if (geo.city)        dayData.cities[geo.city]           = (dayData.cities[geo.city] || 0) + 1;
        _dirtyDaily = true;
      });
    }

    pushEv('visitor_enter', {
      page: page || '/', source, device, browser, os,
      sessionId: sessionId.slice(0, 8),
    });
    _dirtyDaily = true;
  }

  sessions.set(sessionId, {
    id: sessionId, startedAt: existing?.startedAt || now, lastSeen: now,
    page: page || '/', productId: productId || null, productName: productName || null,
    source, ip: cleanIp, device, browser, os,
    language: language || null, timezone: timezone || null,
    utmSource: utmSource || null, utmMedium: utmMedium || null, utmCampaign: utmCampaign || null,
    fp,
  });

  stats.pageViews++;
  lifetime.pageViews++;
  _dirtyDaily = _dirtyLifetime = true;

  if (productId) {
    if (!products.has(productId)) {
      products.set(productId, { id: productId, name: productName || productId, views: 0, checkouts: 0, pix: 0 });
    }
    const p = products.get(productId);
    p.views++;
    if (productName && p.name === productId) p.name = productName;
    _dirtyProducts = true;
    if (products.size > 200) {
      const sorted = [...products.entries()].sort((a, b) => b[1].views - a[1].views);
      sorted.slice(150).forEach(([k]) => products.delete(k));
    }
  }

  emit();
}

// ── record ────────────────────────────────────────────────────────────────────
function record(type, data = {}) {
  checkReset();
  if (type === 'login')          { stats.logins++;         lifetime.logins++;         }
  if (type === 'signup')         { stats.signups++;        lifetime.signups++;        }
  if (type === 'order_created')  {
    stats.orders++;    lifetime.orders++;
    if (data.sessionId) carts.delete(data.sessionId);
  }
  if (type === 'pix_created')    {
    stats.pix++;       lifetime.pix++;
    if (data.sessionId) carts.delete(data.sessionId);
  }
  if (type === 'pix_paid')       { stats.pixPaid++;        lifetime.pixPaid        = (lifetime.pixPaid        || 0) + 1; }
  if (type === 'click_buy')      { stats.clickBuy++;       lifetime.clickBuy       = (lifetime.clickBuy       || 0) + 1; }
  if (type === 'click_whatsapp') { stats.clickWa++;        lifetime.clickWa        = (lifetime.clickWa        || 0) + 1; }
  if (type === 'click_login')    { stats.clickLogin++;     lifetime.clickLogin     = (lifetime.clickLogin     || 0) + 1; }
  if (type === 'click_signup')   { stats.clickSignup++;    lifetime.clickSignup    = (lifetime.clickSignup    || 0) + 1; }
  if (type === 'click_checkout') { stats.clickCheckout++;  lifetime.clickCheckout  = (lifetime.clickCheckout  || 0) + 1; }
  if (type === 'click_calc_frete') { stats.clickCalcFrete++; lifetime.clickCalcFrete = (lifetime.clickCalcFrete || 0) + 1; }

  if (type === 'cart_add') {
    stats.cartAdds++;
    lifetime.cartAdds = (lifetime.cartAdds || 0) + 1;
    const { sessionId, items, total, userEmail, userName, userPhone } = data;
    if (sessionId) {
      const s   = sessions.get(sessionId);
      const vfp = s ? visitors.get(s.fp) : null;
      const existing = carts.get(sessionId);
      carts.set(sessionId, {
        sessionId,
        items:       items        || existing?.items || [],
        total:       total        || 0,
        source:      s?.source    || existing?.source   || 'Direto',
        device:      s?.device    || existing?.device   || 'Desktop',
        ip:          s?.ip        || existing?.ip       || null,
        city:        vfp?.city    || existing?.city     || null,
        country:     vfp?.country || existing?.country  || null,
        addedAt:     existing?.addedAt || new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        userEmail:   userEmail    || existing?.userEmail  || null,
        userName:    userName     || existing?.userName   || null,
        userPhone:   userPhone    || existing?.userPhone  || null,
      });
    }
  }

  if (type === 'checkout_start') {
    stats.checkouts++; lifetime.checkouts++;
    if (data.productId && products.has(data.productId)) { products.get(data.productId).checkouts++; _dirtyProducts = true; }
  }
  if (type === 'pix_created' && data.productId && products.has(data.productId)) {
    products.get(data.productId).pix++; _dirtyProducts = true;
  }
  if (type === 'wa_sent')     wa.sent++;
  if (type === 'wa_received') wa.received++;

  _dirtyDaily = _dirtyLifetime = true;
  pushEv(type, data);
  emit();
}

// ── snap ──────────────────────────────────────────────────────────────────────
function snap() {
  checkReset();
  const now    = Date.now();
  const h1ago  = now - 60 * 60 * 1000;
  const lastHour = sessionStarts.filter(s => new Date(s.at).getTime() > h1ago).length;
  const uniq   = visitorSet.size;
  return {
    activeNow:            sessions.size,
    visitorsToday:        uniq,
    visitorsLastHour:     lastHour,
    pageViewsToday:       stats.pageViews,
    ordersToday:          stats.orders,
    pixToday:             stats.pix,
    pixPaidToday:         stats.pixPaid,
    loginsToday:          stats.logins,
    signupsToday:         stats.signups,
    checkoutsToday:       stats.checkouts,
    clickBuyToday:        stats.clickBuy,
    clickWaToday:         stats.clickWa,
    clickLoginToday:      stats.clickLogin,
    clickSignupToday:     stats.clickSignup,
    clickCheckoutToday:   stats.clickCheckout,
    clickCalcFreteToday:  stats.clickCalcFrete,
    cartAddsToday:        stats.cartAdds,
    activeCartsNow:       carts.size,
    conversionRate:       uniq > 0 ? +(stats.pix / uniq * 100).toFixed(1) : 0,
    sessions:  Array.from(sessions.values()).sort((a, b) => (b.lastSeen > a.lastSeen ? 1 : -1)),
    events:    evBuf.slice(0, 150),
    products:  Array.from(products.values()).sort((a, b) => b.views - a.views).slice(0, 15),
    wa:        { ...wa },
    date:      _day,
    lifetime:  { ...lifetime },
    devices:   { ...dayData.devices },
    browsers:  { ...dayData.browsers },
    os:        { ...dayData.os },
    countries: { ...dayData.countries },
    sources:   { ...dayData.sources },
  };
}

// ── getHistory ────────────────────────────────────────────────────────────────
function getHistory(days) {
  const result = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds  = d.toISOString().slice(0, 10);
    const rec = dailyDB[ds] || blankDay();
    const live = ds === _day;
    result.push({
      date: ds,
      visitors:  live ? visitorSet.size  : rec.visitors,
      pageViews: live ? stats.pageViews  : rec.pageViews,
      logins:    live ? stats.logins     : rec.logins,
      signups:   live ? stats.signups    : rec.signups,
      orders:    live ? stats.orders     : rec.orders,
      pix:       live ? stats.pix        : rec.pix,
      pixPaid:   live ? stats.pixPaid    : rec.pixPaid  || 0,
      checkouts: live ? stats.checkouts  : rec.checkouts,
      clickBuy:  live ? stats.clickBuy   : rec.clickBuy || 0,
      clickWa:   live ? stats.clickWa    : rec.clickWa  || 0,
      byHour:    live ? { ...dayData.byHour }    : rec.byHour    || {},
      sources:   live ? { ...dayData.sources }   : rec.sources   || {},
      devices:   live ? { ...dayData.devices }   : rec.devices   || {},
      browsers:  live ? { ...dayData.browsers }  : rec.browsers  || {},
      os:        live ? { ...dayData.os }        : rec.os        || {},
      countries: live ? { ...dayData.countries } : rec.countries || {},
    });
  }
  return result;
}

// ── getVisitors ───────────────────────────────────────────────────────────────
function getVisitors({ page = 1, limit = 50, search = '', country = '' } = {}) {
  let list = [...visitors.values()].sort((a, b) => (b.lastSeen > a.lastSeen ? 1 : -1));
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(v =>
      (v.ip || '').includes(q) ||
      (v.city || '').toLowerCase().includes(q) ||
      (v.country || '').toLowerCase().includes(q) ||
      (v.browser || '').toLowerCase().includes(q) ||
      (v.utmCampaign || '').toLowerCase().includes(q)
    );
  }
  if (country) list = list.filter(v => (v.countryCode || '').toUpperCase() === country.toUpperCase());
  const total = list.length;
  return { items: list.slice((page - 1) * limit, page * limit), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { heartbeat, record, snap, bus, getHistory, getVisitors, products, lifetime, visitors, carts, abandonedCarts };
