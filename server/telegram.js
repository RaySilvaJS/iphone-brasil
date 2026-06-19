'use strict';
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');
const ALERTS_PATH = path.join(__dirname, 'data', 'alerts.json');

const _readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return {}; } };

// Priority: env var → config.json.telegram → alerts.json.telegram (migration fallback)
const TOKEN   = () => process.env.TELEGRAM_BOT_TOKEN
  || _readJson(CONFIG_PATH).telegram?.botToken
  || _readJson(ALERTS_PATH).telegram?.botToken
  || '';
const CHAT_ID = () => process.env.TELEGRAM_CHAT_ID
  || _readJson(CONFIG_PATH).telegram?.chatId
  || _readJson(ALERTS_PATH).telegram?.chatId
  || '';

// Track last send result for diagnostics
let _lastSent  = null;  // { at, preview, ok }
let _lastError = null;  // { at, message }

// Anti-spam: sessionId → timestamp; only one notification per session (new visitor)
const notifiedSessions = new Map();
// Anti-spam for events: eventKey → timestamp (de-duplicate same event within 30s)
const notifiedEvents   = new Map();

// In-memory notification history (last 100) — exposed for DevOps panel
const history = [];
const MAX_HISTORY = 100;

function addHistory(entry) {
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
}

// Clean stale anti-spam entries every 30 min
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [k, t] of notifiedSessions) if (t < cutoff) notifiedSessions.delete(k);
  for (const [k, t] of notifiedEvents)   if (t < cutoff) notifiedEvents.delete(k);
}, 30 * 60 * 1000).unref();

// ── Low-level HTTP POST to Telegram API ─────────────────────────────────────
function tgPost(text, overrideToken, overrideChatId) {
  const tok = overrideToken || TOKEN();
  const cid = overrideChatId || CHAT_ID();
  if (!tok || !cid) return Promise.resolve(false);
  const body = JSON.stringify({ chat_id: cid, text, parse_mode: 'HTML', disable_web_page_preview: true });
  const opts = {
    hostname: 'api.telegram.org',
    path:     `/bot${tok}/sendMessage`,
    method:   'POST',
    headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };
  return new Promise((resolve) => {
    const req = https.request(opts, res => {
      res.resume();
      const ok = res.statusCode === 200;
      if (ok) {
        _lastSent = { at: new Date().toISOString(), preview: text.slice(0, 80).replace(/<[^>]+>/g, ''), ok: true };
      } else {
        _lastError = { at: new Date().toISOString(), message: `HTTP ${res.statusCode}` };
      }
      resolve(ok);
    });
    req.on('error', (e) => {
      _lastError = { at: new Date().toISOString(), message: e.message };
      resolve(false);
    });
    req.setTimeout(8000, () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

// ── Public send (unified credentials) ────────────────────────────────────────
function send(text) { return tgPost(text); }

// ── Status / diagnostics ──────────────────────────────────────────────────────
function isConfigured() { return !!(TOKEN() && CHAT_ID()); }

function getStatus() {
  const cfg     = _readJson(CONFIG_PATH);
  const alerts  = _readJson(ALERTS_PATH);
  let source = 'none';
  if (process.env.TELEGRAM_BOT_TOKEN) source = 'env';
  else if (cfg.telegram?.botToken)    source = 'config';
  else if (alerts.telegram?.botToken) source = 'alerts';
  return {
    configured: isConfigured(),
    source,
    botTokenSet: !!TOKEN(),
    chatIdSet:   !!CHAT_ID(),
    lastSent:    _lastSent,
    lastError:   _lastError,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDateTime(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate || Date.now());
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function isPaidSource(source) {
  return /Facebook Ads|Instagram Ads|Google Ads|TikTok Ads|Tráfego Pago/i.test(source || '');
}

// ── 1. Notificação de visitante de tráfego pago ──────────────────────────────
// Called with full session object after geo lookup (3s delay in tracker.js)
function notifyPaidVisitor(session) {
  if (!TOKEN() || !CHAT_ID()) return;
  if (!session || !session.id) return;
  if (notifiedSessions.has(session.id)) return; // already notified this session
  notifiedSessions.set(session.id, Date.now());

  const source = session.paidSource || session.source || 'Tráfego Pago';
  const now    = new Date().toISOString();

  const emojiMap = {
    'Facebook Ads':  '📘',
    'Instagram Ads': '📸',
    'Google Ads':    '🔍',
    'TikTok Ads':    '🎵',
  };
  const icon = emojiMap[source] || '🚀';

  // Visitor ID prefix
  const prefix = source.includes('Instagram') ? 'IG' : source.includes('Facebook') ? 'FB' : source.includes('Google') ? 'GG' : 'AD';

  let text = `${icon} <b>NOVO VISITANTE — ${source.toUpperCase()}</b>\n`;
  text += `─────────────────────\n`;
  text += `📅 <b>Data:</b> ${fmtDateTime(now)}\n\n`;
  text += `🌎 <b>Origem:</b> ${source}\n`;
  if (session.device)  text += `📱 <b>Dispositivo:</b> ${session.device}\n`;
  if (session.browser) text += `🌐 <b>Navegador:</b> ${session.browser}\n`;
  if (session.city)    text += `🌍 <b>Cidade:</b> ${session.city}\n`;
  if (session.country) text += `🇧🇷 <b>País:</b> ${session.country}\n`;

  if (session.page) {
    text += `\n🔗 <b>Página:</b>\n${session.page}\n`;
  }

  if (session.utmCampaign) text += `\n📢 <b>Campanha:</b>\n${session.utmCampaign}\n`;
  if (session.utmSource)   text += `\n🎯 <b>UTM Source:</b>\n${session.utmSource}\n`;
  if (session.utmMedium)   text += `🎯 <b>UTM Medium:</b>\n${session.utmMedium}\n`;
  if (session.utmContent)  text += `🎯 <b>UTM Content:</b>\n${session.utmContent}\n`;
  if (session.fbclid) {
    const short = String(session.fbclid).slice(-10);
    text += `\n🆔 <b>FBCLID:</b> ...${short}\n`;
  }
  if (session.gclid) {
    const short = String(session.gclid).slice(-10);
    text += `\n🆔 <b>GCLID:</b> ...${short}\n`;
  }
  text += `\n👤 <b>Visitante ID:</b> ${prefix}-${session.id.slice(0, 8).toUpperCase()}`;

  tgPost(text);
  addHistory({ type: 'paid_visitor', source, sessionId: session.id, sentAt: now, preview: `${icon} Visitante ${source} · ${session.city || '—'} · ${session.device || '—'}` });
}

// ── 2. Notificações de eventos ────────────────────────────────────────────────
function notifyEvent(type, data = {}) {
  if (!TOKEN() || !CHAT_ID()) return;

  // De-duplicate: same type+identifier within 30s doesn't fire again
  const dedupeKey = `${type}:${data.email || data.phone || data.orderId || data.sessionId || ''}`;
  if (notifiedEvents.has(dedupeKey)) return;
  notifiedEvents.set(dedupeKey, Date.now());

  const now  = new Date().toISOString();
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let text = '';

  switch (type) {
    case 'signup':
      text  = `📝 <b>NOVO CADASTRO</b>\n`;
      text += `─────────────────────\n`;
      text += `⏰ ${time}\n`;
      if (data.nome)  text += `👤 <b>Nome:</b> ${data.nome}\n`;
      if (data.email) text += `📧 <b>Email:</b> ${data.email}\n`;
      if (data.phone) text += `📱 <b>WhatsApp:</b> ${data.phone}\n`;
      break;

    case 'login':
      text  = `🔑 <b>NOVO LOGIN</b>\n`;
      text += `─────────────────────\n`;
      text += `⏰ ${time}\n`;
      if (data.email) text += `📧 <b>Email:</b> ${data.email}\n`;
      break;

    case 'order_created':
      text  = `📋 <b>NOVO PEDIDO CRIADO</b>\n`;
      text += `─────────────────────\n`;
      text += `⏰ ${time}\n`;
      if (data.total) text += `💰 <b>Total:</b> R$ ${Number(data.total || 0).toFixed(2)}\n`;
      if (data.email) text += `📧 ${data.email}\n`;
      if (data.phone) text += `📱 ${data.phone}\n`;
      if (data.campaign) text += `📢 <b>Campanha:</b> ${data.campaign}\n`;
      break;

    case 'pix_created':
      text  = `💳 <b>PIX GERADO</b>\n`;
      text += `─────────────────────\n`;
      text += `⏰ ${time}\n`;
      if (data.total) text += `💰 <b>Valor:</b> R$ ${Number(data.total || 0).toFixed(2)}\n`;
      if (data.phone) text += `📱 ${data.phone}\n`;
      if (data.campaign) text += `📢 <b>Campanha:</b> ${data.campaign}\n`;
      break;

    case 'pix_paid':
      text  = `✅ <b>PIX CONFIRMADO — VENDA REALIZADA!</b>\n`;
      text += `─────────────────────\n`;
      text += `⏰ ${time}\n`;
      if (data.total)    text += `💰 <b>Valor:</b> R$ ${Number(data.total || 0).toFixed(2)}\n`;
      if (data.email)    text += `📧 ${data.email}\n`;
      if (data.phone)    text += `📱 ${data.phone}\n`;
      if (data.campaign) text += `📢 <b>Campanha:</b> ${data.campaign}\n`;
      break;

    case 'checkout_start':
      text  = `🛒 <b>CHECKOUT INICIADO</b>\n`;
      text += `─────────────────────\n`;
      text += `⏰ ${time}\n`;
      if (data.total)    text += `💰 <b>Total:</b> R$ ${Number(data.total || 0).toFixed(2)}\n`;
      if (data.source)   text += `🌎 <b>Origem:</b> ${data.source}\n`;
      if (data.campaign) text += `📢 <b>Campanha:</b> ${data.campaign}\n`;
      break;

    case 'cart_abandoned':
      text  = `🛒 <b>CARRINHO ABANDONADO</b>\n`;
      text += `─────────────────────\n`;
      text += `⏰ ${time}\n`;
      if (data.total)     text += `💰 <b>Total:</b> R$ ${Number(data.total || 0).toFixed(2)}\n`;
      if (data.userEmail) text += `📧 ${data.userEmail}\n`;
      if (data.city)      text += `🌍 <b>Cidade:</b> ${data.city}\n`;
      if (data.source)    text += `🌎 <b>Origem:</b> ${data.source}\n`;
      if (data.items && data.items.length) {
        const prodStr = data.items.slice(0, 3).map(i => `• ${i.nome || i.id} ×${i.quantidade || 1}`).join('\n');
        text += `\n🛍️ <b>Produtos:</b>\n${prodStr}\n`;
      }
      break;

    default:
      return;
  }

  if (!text) return;
  tgPost(text);
  const previews = {
    signup:         `📝 Cadastro · ${data.email || '—'}`,
    login:          `🔑 Login · ${data.email || '—'}`,
    order_created:  `📋 Pedido R$${Number(data.total || 0).toFixed(0)} · ${data.email || '—'}`,
    pix_created:    `💳 PIX R$${Number(data.total || 0).toFixed(0)} · ${data.phone || '—'}`,
    pix_paid:       `✅ PAGO R$${Number(data.total || 0).toFixed(0)} · ${data.email || '—'}`,
    checkout_start: `🛒 Checkout R$${Number(data.total || 0).toFixed(0)} · ${data.source || '—'}`,
    cart_abandoned: `🛒 Carrinho R$${Number(data.total || 0).toFixed(0)} abandonado`,
  };
  addHistory({ type, sentAt: now, preview: previews[type] || type });
}

module.exports = { notifyPaidVisitor, notifyEvent, history, send, isConfigured, getStatus };
