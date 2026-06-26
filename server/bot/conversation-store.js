'use strict';
const fs   = require('fs');
const path = require('path');

const STORE_PATH           = path.join(__dirname, '..', 'data', 'bot', 'conversations.json');
const MAX_HISTORY_PER_CONV = 30;
const MAX_PROCESSED_IDS    = 100;

function ensureFile() {
  if (!fs.existsSync(STORE_PATH)) {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, '{}', 'utf-8');
  }
}

function load() {
  ensureFile();
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')); } catch { return {}; }
}

function save(data) {
  try {
    const tmp = STORE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, STORE_PATH);
  } catch {}
}

function phoneKey(phone) {
  return String(phone).replace(/\D/g, '');
}

function getConversation(phone) {
  const key = phoneKey(phone);
  const all = load();
  if (!all[key]) {
    all[key] = {
      phone:           key,
      firstMessageAt:  new Date().toISOString(),
      lastMessageAt:   new Date().toISOString(),
      state:           'idle',
      context:         {},
      history:         [],
      processedIds:    [],
      repliesInMinute: [],
    };
    save(all);
  }
  return all[key];
}

function updateConversation(phone, updates) {
  const key = phoneKey(phone);
  const all = load();
  if (!all[key]) getConversation(phone);
  all[key] = { ...all[key], ...updates, lastMessageAt: new Date().toISOString() };
  save(all);
  return all[key];
}

function addMessage(phone, role, text) {
  const key = phoneKey(phone);
  const all = load();
  if (!all[key]) getConversation(phone);
  const conv = all[key];
  conv.history = conv.history || [];
  conv.history.push({ role, text, at: new Date().toISOString() });
  if (conv.history.length > MAX_HISTORY_PER_CONV) {
    conv.history = conv.history.slice(-MAX_HISTORY_PER_CONV);
  }
  conv.lastMessageAt = new Date().toISOString();
  save(all);
}

function isProcessed(phone, msgId) {
  const conv = getConversation(phone);
  return (conv.processedIds || []).includes(msgId);
}

function markProcessed(phone, msgId) {
  const key = phoneKey(phone);
  const all = load();
  if (!all[key]) getConversation(phone);
  const conv = all[key];
  conv.processedIds = conv.processedIds || [];
  if (!conv.processedIds.includes(msgId)) {
    conv.processedIds.push(msgId);
    if (conv.processedIds.length > MAX_PROCESSED_IDS) {
      conv.processedIds = conv.processedIds.slice(-MAX_PROCESSED_IDS);
    }
  }
  save(all);
}

function isRateLimited(phone, maxReplies) {
  const key      = phoneKey(phone);
  const all      = load();
  if (!all[key]) return false;
  const conv     = all[key];
  const now      = Date.now();
  const windowMs = 60 * 1000;
  conv.repliesInMinute = (conv.repliesInMinute || []).filter(t => now - t < windowMs);
  if (conv.repliesInMinute.length >= maxReplies) {
    save(all);
    return true;
  }
  conv.repliesInMinute.push(now);
  save(all);
  return false;
}

function purgeOld(ttlDays = 30) {
  const all    = load();
  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();
  let changed  = false;
  for (const key of Object.keys(all)) {
    if ((all[key].lastMessageAt || '') < cutoff) { delete all[key]; changed = true; }
  }
  if (changed) save(all);
}

module.exports = { getConversation, updateConversation, addMessage, isProcessed, markProcessed, isRateLimited, purgeOld };
