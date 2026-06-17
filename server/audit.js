'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'audit.json');
const MAX = 2000;

let log = [];
try { log = JSON.parse(fs.readFileSync(FILE, 'utf-8')); } catch { log = []; }

// Debounced disk write (avoids hammering disk on burst)
let _saveTimer = null;
function save() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    try { fs.writeFileSync(FILE, JSON.stringify(log, null, 2)); } catch {}
  }, 3000);
}

function append(type, user, ip, data = {}) {
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    user: user || 'sistema',
    ip: ip ? String(ip).replace('::ffff:', '').replace('::1', '127.0.0.1') : '?',
    data,
    at: new Date().toISOString()
  };
  log.unshift(entry);
  if (log.length > MAX) log.length = MAX;
  save();
  return entry;
}

function get(limit = 200, type = null) {
  const result = type ? log.filter(e => e.type === type) : log;
  return result.slice(0, limit);
}

module.exports = { append, get };
