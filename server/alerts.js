'use strict';
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const telegram = require('./telegram');

const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');
const ALERTS_PATH = path.join(__dirname, 'data', 'alerts.json');

// ── Config helpers ────────────────────────────────────────────────────────────
const loadConfig  = () => { try { return JSON.parse(fs.readFileSync(CONFIG_PATH,  'utf-8')); } catch { return {}; } };
const loadAlerts  = () => { try { return JSON.parse(fs.readFileSync(ALERTS_PATH,  'utf-8')); } catch { return defaultAlerts(); } };
const saveAlerts  = (a) => { try { fs.writeFileSync(ALERTS_PATH, JSON.stringify(a, null, 2)); } catch {} };

// ── Default alert configuration ───────────────────────────────────────────────
function defaultAlerts() {
  return {
    telegram: { enabled: false, botToken: '', chatId: '' },
    rules: [
      { id: 'wa_down',        label: 'WhatsApp desconectado', enabled: true,  cooldownMin: 10,  threshold: { minutes: 5 } },
      { id: 'cpu_high',       label: 'CPU alta',              enabled: true,  cooldownMin: 15,  threshold: { percent: 85, durationMin: 3 } },
      { id: 'ram_high',       label: 'RAM alta',              enabled: true,  cooldownMin: 15,  threshold: { percent: 90 } },
      { id: 'disk_high',      label: 'Disco quase cheio',     enabled: true,  cooldownMin: 60,  threshold: { percent: 85 } },
      { id: 'disk_critical',  label: 'Disco crítico',         enabled: true,  cooldownMin: 30,  threshold: { percent: 95 } },
      { id: 'no_visitors',    label: 'Sem visitantes',        enabled: false, cooldownMin: 120, threshold: { minutes: 30, startHour: 8, endHour: 22 } },
      { id: 'brute_force',    label: 'Força bruta detectada', enabled: true,  cooldownMin: 30,  threshold: {} },
      { id: 'error_spike',    label: 'Pico de erros críticos',enabled: true,  cooldownMin: 20,  threshold: { count: 5, windowMin: 5 } },
    ],
    history: [],  // last 200 fired alerts
  };
}

// ── In-memory state for multi-sample checks ───────────────────────────────────
let _cpuSamples = [];          // [{ts, percent}] for sustained-CPU check
let _errorWindow = [];         // [ts] recent error timestamps
let _lastFired = {};           // { ruleId: timestamp }
let _waDisconnectedSince = null;

// ── Fire an alert ─────────────────────────────────────────────────────────────
async function fire(ruleId, label, message, cfg) {
  const now = Date.now();
  const cooldownMs = ((cfg.rules.find(r => r.id === ruleId)?.cooldownMin) || 30) * 60 * 1000;

  if (_lastFired[ruleId] && now - _lastFired[ruleId] < cooldownMs) return; // cooldown
  _lastFired[ruleId] = now;

  const entry = { id: ruleId, label, message, at: new Date().toISOString() };
  cfg.history = [entry, ...(cfg.history || [])].slice(0, 200);
  saveAlerts(cfg);

  console.warn(`[ALERT] ${label}: ${message}`);

  // Send internal notification
  try {
    const sec = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'security.json'), 'utf-8'));
    sec.notifications = [
      { id: Date.now().toString(36), title: `🚨 ${label}`, message, at: new Date().toISOString(), read: false },
      ...(sec.notifications || [])
    ].slice(0, 100);
    fs.writeFileSync(path.join(__dirname, 'data', 'security.json'), JSON.stringify(sec, null, 2));
  } catch {}

  // Send Telegram (uses centralized credentials from config.json / env)
  if (telegram.isConfigured()) {
    const text = `🚨 <b>${label}</b>\n\n${message}\n\n<i>${new Date().toLocaleString('pt-BR')}</i>`;
    const ok = await telegram.send(text);
    if (!ok) console.warn('[ALERT] Falha ao enviar mensagem no Telegram.');
  }
}

// ── Track error timestamps (called by logger when error fires) ────────────────
function trackError() {
  _errorWindow.push(Date.now());
  const cutoff = Date.now() - 10 * 60 * 1000;
  _errorWindow = _errorWindow.filter(t => t > cutoff);
}

// ── Track WA status ───────────────────────────────────────────────────────────
function trackWaStatus(status) {
  if (status === 'connected') {
    _waDisconnectedSince = null;
  } else if (!_waDisconnectedSince) {
    _waDisconnectedSince = Date.now();
  }
}

// ── CPU helper ────────────────────────────────────────────────────────────────
let _prevCpu = null;
function getCpuPercent() {
  const cpus = os.cpus();
  const idle  = cpus.reduce((s, c) => s + c.times.idle, 0);
  const total = cpus.reduce((s, c) => s + Object.values(c.times).reduce((a,b) => a+b,0), 0);
  if (!_prevCpu) { _prevCpu = { idle, total }; return 0; }
  const di = idle  - _prevCpu.idle;
  const dt = total - _prevCpu.total;
  _prevCpu = { idle, total };
  return dt > 0 ? Math.max(0, Math.round(100 * (1 - di / dt))) : 0;
}

// ── Disk helper ───────────────────────────────────────────────────────────────
function getDiskPercent() {
  return new Promise(resolve => {
    const isWin = process.platform === 'win32';
    const cmd = isWin
      ? 'wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size /value'
      : "df -B1 / | awk 'NR==2{print $2,$3}'";
    require('child_process').exec(cmd, (err, out) => {
      if (err || !out) return resolve(0);
      if (isWin) {
        const free  = parseInt((out.match(/FreeSpace=(\d+)/) || [])[1]) || 0;
        const total = parseInt((out.match(/Size=(\d+)/)      || [])[1]) || 0;
        return resolve(total ? Math.round((total - free) / total * 100) : 0);
      }
      const [t, u] = out.trim().split(/\s+/).map(Number);
      resolve(t ? Math.round(u / t * 100) : 0);
    });
  });
}

// ── Main check loop ───────────────────────────────────────────────────────────
async function check() {
  const cfg = loadAlerts();
  const enabled = (id) => cfg.rules.find(r => r.id === id)?.enabled;

  // CPU check (sustained)
  const cpu = getCpuPercent();
  _cpuSamples.push({ ts: Date.now(), percent: cpu });
  _cpuSamples = _cpuSamples.filter(s => s.ts > Date.now() - 5 * 60 * 1000);

  if (enabled('cpu_high')) {
    const rule = cfg.rules.find(r => r.id === 'cpu_high');
    const durationMs = (rule?.threshold?.durationMin || 3) * 60 * 1000;
    const threshold  = rule?.threshold?.percent || 85;
    const recent = _cpuSamples.filter(s => s.ts > Date.now() - durationMs);
    if (recent.length >= 3 && recent.every(s => s.percent >= threshold)) {
      await fire('cpu_high', 'CPU Alta', `CPU em ${cpu}% por mais de ${rule.threshold.durationMin} minutos.`, cfg);
    }
  }

  // RAM check
  if (enabled('ram_high')) {
    const rule = cfg.rules.find(r => r.id === 'ram_high');
    const threshold = rule?.threshold?.percent || 90;
    const mem = os.totalmem();
    const used = mem - os.freemem();
    const pct = Math.round(used / mem * 100);
    if (pct >= threshold) {
      await fire('ram_high', 'RAM Alta', `RAM em ${pct}% (${Math.round(used/1024/1024)}MB usados de ${Math.round(mem/1024/1024)}MB).`, cfg);
    }
  }

  // Disk check
  const diskPct = await getDiskPercent();
  if (enabled('disk_critical') && diskPct >= (cfg.rules.find(r => r.id === 'disk_critical')?.threshold?.percent || 95)) {
    await fire('disk_critical', 'Disco Crítico', `Disco em ${diskPct}% — risco de falha iminente!`, cfg);
  } else if (enabled('disk_high') && diskPct >= (cfg.rules.find(r => r.id === 'disk_high')?.threshold?.percent || 85)) {
    await fire('disk_high', 'Disco Quase Cheio', `Disco em ${diskPct}%.`, cfg);
  }

  // WhatsApp disconnection
  if (enabled('wa_down') && _waDisconnectedSince) {
    const rule = cfg.rules.find(r => r.id === 'wa_down');
    const maxMs = (rule?.threshold?.minutes || 5) * 60 * 1000;
    const downMs = Date.now() - _waDisconnectedSince;
    if (downMs >= maxMs) {
      const mins = Math.round(downMs / 60000);
      await fire('wa_down', 'WhatsApp Desconectado', `WhatsApp está offline há ${mins} minuto${mins !== 1 ? 's' : ''}.`, cfg);
    }
  }

  // Error spike
  if (enabled('error_spike')) {
    const rule = cfg.rules.find(r => r.id === 'error_spike');
    const windowMs = (rule?.threshold?.windowMin || 5) * 60 * 1000;
    const maxCount = rule?.threshold?.count || 5;
    const recent = _errorWindow.filter(t => t > Date.now() - windowMs);
    if (recent.length >= maxCount) {
      await fire('error_spike', 'Pico de Erros', `${recent.length} erros críticos nos últimos ${rule.threshold.windowMin} minutos.`, cfg);
    }
  }

  // No visitors during business hours
  if (enabled('no_visitors')) {
    const rule = cfg.rules.find(r => r.id === 'no_visitors');
    const h = new Date().getHours();
    const start = rule?.threshold?.startHour ?? 8;
    const end   = rule?.threshold?.endHour   ?? 22;
    if (h >= start && h < end) {
      try {
        const snap = require('./tracker').snap();
        if (snap.visitorsLastHour === 0) {
          await fire('no_visitors', 'Sem Visitantes', `Nenhum visitante na última hora (horário ${start}h–${end}h).`, cfg);
        }
      } catch {}
    }
  }
}

// ── Start polling ─────────────────────────────────────────────────────────────
let _interval = null;
function start() {
  if (_interval) return;
  _interval = setInterval(() => { check().catch(() => {}); }, 60 * 1000);
  // First check after 30s to let everything initialize
  setTimeout(() => check().catch(() => {}), 30 * 1000);
  console.log('[ALERTS] Sistema de alertas iniciado (verificação a cada 60s).');
}

module.exports = {
  start,
  trackError,
  trackWaStatus,
  loadAlerts,
  saveAlerts,
  defaultAlerts,
  fire,
};
