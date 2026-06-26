'use strict';
const fs   = require('fs');
const path = require('path');

const LOGS_PATH = path.join(__dirname, '..', 'data', 'bot', 'logs.json');
const MAX_LOGS  = 500;

function ensureFile() {
  if (!fs.existsSync(LOGS_PATH)) {
    fs.mkdirSync(path.dirname(LOGS_PATH), { recursive: true });
    fs.writeFileSync(LOGS_PATH, '[]', 'utf-8');
  }
}

function loadLogs() {
  try { return JSON.parse(fs.readFileSync(LOGS_PATH, 'utf-8')); } catch { return []; }
}

function saveLogs(logs) {
  try {
    const tmp = LOGS_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(logs.slice(0, MAX_LOGS), null, 2), 'utf-8');
    fs.renameSync(tmp, LOGS_PATH);
  } catch {}
}

function log(level, message, data = {}) {
  ensureFile();
  const entry = { level, message, data, at: new Date().toISOString() };
  console.log(`[BOT][${level.toUpperCase()}] ${message}`, data.phone || data.error || '');
  const logs = loadLogs();
  logs.unshift(entry);
  saveLogs(logs);
}

module.exports = {
  info:  (msg, data) => log('info',  msg, data),
  warn:  (msg, data) => log('warn',  msg, data),
  error: (msg, data) => log('error', msg, data),
};
