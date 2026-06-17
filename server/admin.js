const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(__dirname, 'data');
const BACKUPS = path.join(DATA, 'backups');
const CONFIG_PATH = path.join(DATA, 'config.json');
const SECURITY_PATH = path.join(DATA, 'security.json');

if (!fs.existsSync(BACKUPS)) fs.mkdirSync(BACKUPS, { recursive: true });

// ---- Helpers ----
const loadConfig = () => {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); }
  catch { return { maintenance: false, version: '1.0.0', lastDeploy: null, deployHistory: [], startedAt: new Date().toISOString() }; }
};
const saveConfig = (c) => fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2));

const loadSecurity = () => {
  try { return JSON.parse(fs.readFileSync(SECURITY_PATH, 'utf-8')); }
  catch { return { blockedIPs: [], loginAttempts: [], notifications: [] }; }
};
const saveSecurity = (s) => fs.writeFileSync(SECURITY_PATH, JSON.stringify(s, null, 2));

const fmtBytes = (b) => {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
};

// ---- Admin auth middleware ----
const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'] || req.query.adminToken;
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

  if (ADMIN_TOKEN && token === ADMIN_TOKEN) return next();

  // Accept user tokens from admin-role users
  try {
    const users = JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf-8'));
    const ut = req.headers['x-auth-token'] || req.query.token;
    if (ut) {
      const u = users.find(u => u.token === ut && ['admin', 'superadmin'].includes(u.role));
      if (u) { req.adminUser = u; return next(); }
    }
  } catch {}

  res.status(403).json({ error: 'Acesso negado.' });
};

// ---- CPU tracking ----
let prevCpu = null;
const getCpuUsage = () => {
  const cpus = os.cpus();
  const idle = cpus.reduce((s, c) => s + c.times.idle, 0);
  const total = cpus.reduce((s, c) => s + Object.values(c.times).reduce((a, b) => a + b, 0), 0);
  if (!prevCpu) { prevCpu = { idle, total }; return 0; }
  const di = idle - prevCpu.idle, dt = total - prevCpu.total;
  prevCpu = { idle, total };
  return dt > 0 ? Math.max(0, Math.round(100 * (1 - di / dt))) : 0;
};

const getDisk = () => new Promise(resolve => {
  const isWin = process.platform === 'win32';
  const cmd = isWin
    ? 'wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size /value'
    : "df -B1 / | awk 'NR==2{print $2,$3,$4}'";
  exec(cmd, (err, out) => {
    if (err || !out) return resolve({ total: 0, used: 0, free: 0, percent: 0 });
    if (isWin) {
      const free = parseInt((out.match(/FreeSpace=(\d+)/) || [])[1]) || 0;
      const total = parseInt((out.match(/Size=(\d+)/) || [])[1]) || 0;
      const used = total - free;
      return resolve({ total, used, free, percent: total ? Math.round(used / total * 100) : 0 });
    }
    const [t, u, f] = out.trim().split(/\s+/).map(Number);
    resolve({ total: t || 0, used: u || 0, free: f || 0, percent: t ? Math.round(u / t * 100) : 0 });
  });
});

// ---- File manager path sanitizer ----
const RESTRICTED = ['.env', 'auth_info', '.git'];
const safePath = (reqPath) => {
  const p = path.resolve(ROOT, (reqPath || '').replace(/^[/\\]+/, ''));
  if (!p.startsWith(ROOT)) throw new Error('Acesso negado');
  const rel = path.relative(ROOT, p);
  if (RESTRICTED.some(r => rel.split(/[/\\]/).includes(r))) throw new Error('Arquivo restrito');
  return p;
};

// ============================================================
// ROUTES
// ============================================================

router.get('/auth/verify', adminAuth, (req, res) => res.json({ ok: true }));

// ---- System Info ----
router.get('/system/info', adminAuth, (req, res) => {
  const cfg = loadConfig();
  res.json({
    version: cfg.version || '1.0.0',
    lastDeploy: cfg.lastDeploy || null,
    deployHistory: (cfg.deployHistory || []).slice(0, 10),
    nodeVersion: process.version,
    platform: process.platform,
    appUptime: process.uptime(),
    pid: process.pid
  });
});

// ---- Deploy (POST → SSE streaming) ----
router.post('/system/deploy', adminAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (type, data) => {
    try { res.write(`data: ${JSON.stringify({ type, data, ts: Date.now() })}\n\n`); } catch {}
    logger.deploy(String(data));
  };

  const runCmd = (label, cmd, args) => new Promise((resolve, reject) => {
    send('step', `▶ ${label}`);
    const p = spawn(cmd, args, { cwd: ROOT, shell: true });
    p.stdout.on('data', d => send('log', d.toString()));
    p.stderr.on('data', d => send('log', d.toString()));
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${label} falhou (código ${code})`)));
  });

  (async () => {
    const cfg = loadConfig();
    const record = { id: uuidv4(), at: new Date().toISOString(), by: req.adminUser?.nome || 'admin' };
    try {
      send('start', 'Iniciando deploy...');
      await runCmd('git pull origin main', 'git', ['pull', 'origin', 'main']);
      await runCmd('npm install', 'npm', ['install', '--omit=dev']);
      if (fs.existsSync(path.join(ROOT, 'deploy.sh'))) {
        await runCmd('bash deploy.sh', 'bash', ['deploy.sh']);
      }
      record.status = 'success';
      send('done', 'Deploy concluído com sucesso!');
    } catch (err) {
      record.status = 'error';
      record.error = err.message;
      send('error', `Deploy falhou: ${err.message}`);
    }
    cfg.lastDeploy = record;
    cfg.deployHistory = [record, ...(cfg.deployHistory || [])].slice(0, 20);
    saveConfig(cfg);
    res.end();
  })();
});

// ---- System Commands ----
router.post('/system/restart-app', adminAuth, (req, res) => {
  res.json({ ok: true, message: 'Reiniciando aplicação...' });
  setTimeout(() => process.exit(0), 300);
});

router.post('/system/restart-pm2', adminAuth, (req, res) => {
  exec('pm2 restart all 2>&1', (err, out) => res.json({ ok: !err, output: out || err?.message }));
});

router.post('/system/restart-nginx', adminAuth, (req, res) => {
  exec('sudo systemctl restart nginx 2>&1', (err, out) => res.json({ ok: !err, output: out || err?.message }));
});

router.post('/system/clear-cache', adminAuth, (req, res) => {
  Object.keys(require.cache).filter(k => k.includes(`${path.sep}data${path.sep}`)).forEach(k => delete require.cache[k]);
  res.json({ ok: true, message: 'Cache da aplicação limpo.' });
});

// ---- Monitor ----
router.get('/monitor', adminAuth, async (req, res) => {
  const mem = { total: os.totalmem(), free: os.freemem() };
  mem.used = mem.total - mem.free;
  mem.percent = Math.round(mem.used / mem.total * 100);
  const disk = await getDisk();
  res.json({
    cpu: { percent: getCpuUsage(), cores: os.cpus().length, model: os.cpus()[0]?.model || 'N/A' },
    ram: { ...mem, totalFmt: fmtBytes(mem.total), usedFmt: fmtBytes(mem.used), freeFmt: fmtBytes(mem.free) },
    disk: { ...disk, totalFmt: fmtBytes(disk.total), usedFmt: fmtBytes(disk.used), freeFmt: fmtBytes(disk.free) },
    uptime: { server: os.uptime(), app: process.uptime() },
    load: os.loadavg(),
    platform: process.platform,
    arch: os.arch()
  });
});

// SSE stream for real-time metrics
router.get('/monitor/stream', adminAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const tick = () => {
    const mem = { total: os.totalmem(), free: os.freemem() };
    mem.used = mem.total - mem.free;
    try {
      res.write(`data: ${JSON.stringify({
        cpu: getCpuUsage(),
        ram: Math.round(mem.used / mem.total * 100),
        ramUsed: fmtBytes(mem.used),
        ramFree: fmtBytes(mem.free),
        ts: Date.now()
      })}\n\n`);
    } catch {}
  };

  tick();
  const iv = setInterval(tick, 2000);
  req.on('close', () => clearInterval(iv));
});

// ---- WhatsApp ----
router.get('/whatsapp', adminAuth, (req, res) => {
  try {
    const wa = require('./whatsapp');
    const waState = wa.getWhatsAppState ? wa.getWhatsAppState() : { status: 'unknown' };
    const mem = process.memoryUsage();
    res.json({
      ...waState,
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal
      }
    });
  } catch (e) { res.json({ status: 'error', error: e.message }); }
});

router.post('/whatsapp/restart', adminAuth, async (req, res) => {
  try {
    const wa = require('./whatsapp');
    if (wa.restartWhatsApp) await wa.restartWhatsApp();
    res.json({ ok: true, message: 'WhatsApp reiniciado.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/whatsapp/reconnect', adminAuth, async (req, res) => {
  try {
    const wa = require('./whatsapp');
    if (wa.restartWhatsApp) await wa.restartWhatsApp();
    res.json({ ok: true, message: 'Reconectando WhatsApp...' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/whatsapp/disconnect', adminAuth, async (req, res) => {
  try {
    const wa = require('./whatsapp');
    if (wa.disconnectWhatsApp) await wa.disconnectWhatsApp();
    res.json({ ok: true, message: 'WhatsApp desconectado.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/whatsapp/clear-session', adminAuth, async (req, res) => {
  try {
    const wa = require('./whatsapp');
    if (wa.clearSession) await wa.clearSession();
    res.json({ ok: true, message: 'Sessão limpa. Aguarde o novo QR Code.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- PM2 Status ----
router.get('/pm2/status', adminAuth, (req, res) => {
  exec('pm2 jlist 2>&1', (err, out) => {
    if (err && !out) return res.json({ ok: false, error: 'PM2 não disponível.', processes: [] });
    try {
      const list = JSON.parse(out);
      res.json({
        ok: true,
        processes: list.map(p => ({
          name: p.name,
          id: p.pm_id,
          status: p.pm2_env?.status,
          pid: p.pid,
          uptime: p.pm2_env?.pm_uptime,
          restarts: p.pm2_env?.restart_time,
          cpu: p.monit?.cpu,
          memory: p.monit?.memory,
          version: p.pm2_env?.version
        }))
      });
    } catch {
      res.json({ ok: false, error: 'Resposta PM2 inválida (não está rodando via PM2?)', processes: [] });
    }
  });
});

// ---- Logs ----
router.get('/logs', adminAuth, (req, res) => {
  const { type = 'app', limit = '200', q = '' } = req.query;
  let logs = logger.get(type);
  if (q) { const re = new RegExp(q, 'i'); logs = logs.filter(l => re.test(l.msg)); }
  res.json(logs.slice(0, parseInt(limit)));
});

router.get('/logs/download', adminAuth, (req, res) => {
  const { type = 'app' } = req.query;
  const text = logger.get(type).map(l => `[${new Date(l.ts).toISOString()}] [${l.level.toUpperCase()}] ${l.msg}`).join('\n');
  res.setHeader('Content-Disposition', `attachment; filename="logs-${type}-${Date.now()}.txt"`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(text);
});

// ---- Backup ----
router.get('/backup/list', adminAuth, (req, res) => {
  try {
    const files = fs.readdirSync(BACKUPS)
      .filter(f => /\.(tar\.gz|zip|json)$/.test(f))
      .map(f => {
        const s = fs.statSync(path.join(BACKUPS, f));
        return { name: f, size: s.size, sizeFmt: fmtBytes(s.size), createdAt: s.birthtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(files);
  } catch { res.json([]); }
});

router.post('/backup', adminAuth, (req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tarName = `backup_${stamp}.tar.gz`;
  const tarPath = path.join(BACKUPS, tarName);

  exec(`tar -czf "${tarPath}" -C "${ROOT}" server/data 2>&1`, (err, out) => {
    if (err) {
      // JSON fallback
      try {
        const data = {};
        ['payments.json','users.json','products.json','config.json','security.json'].forEach(f => {
          const fp = path.join(DATA, f);
          if (fs.existsSync(fp)) { try { data[f] = JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch {} }
        });
        const jName = `backup_${stamp}.json`;
        fs.writeFileSync(path.join(BACKUPS, jName), JSON.stringify(data, null, 2));
        return res.json({ ok: true, name: jName, warning: 'tar indisponível, backup JSON criado.' });
      } catch (e2) {
        return res.status(500).json({ error: 'Falha no backup: ' + (err.message || out) });
      }
    }
    res.json({ ok: true, name: tarName });
  });
});

router.get('/backup/:name', adminAuth, (req, res) => {
  const fp = path.join(BACKUPS, path.basename(req.params.name));
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Não encontrado' });
  res.download(fp);
});

router.delete('/backup/:name', adminAuth, (req, res) => {
  const fp = path.join(BACKUPS, path.basename(req.params.name));
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Não encontrado' });
  fs.unlinkSync(fp);
  res.json({ ok: true });
});

// ---- File Manager ----
router.get('/files', adminAuth, (req, res) => {
  try {
    const dir = safePath(req.query.path || '');
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return res.status(404).json({ error: 'Diretório não encontrado' });
    const entries = fs.readdirSync(dir)
      .map(name => {
        try {
          const s = fs.statSync(path.join(dir, name));
          return { name, type: s.isDirectory() ? 'dir' : 'file', size: s.size, sizeFmt: fmtBytes(s.size), modified: s.mtime, ext: path.extname(name).slice(1).toLowerCase() };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1);
    res.json({ path: path.relative(ROOT, dir).replace(/\\/g, '/') || '/', entries });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/files/download', adminAuth, (req, res) => {
  try {
    const fp = safePath(req.query.path);
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) return res.status(400).json({ error: 'Inválido' });
    res.download(fp);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/files/upload', adminAuth, (req, res) => {
  try {
    const { targetPath, name, data } = req.body;
    const dir = safePath(targetPath || '');
    const safeName = path.basename(name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    fs.writeFileSync(path.join(dir, safeName), Buffer.from(data, 'base64'));
    res.json({ ok: true, name: safeName });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/files', adminAuth, (req, res) => {
  try {
    const fp = safePath((req.body || {}).path || req.query.path);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Não encontrado' });
    fs.statSync(fp).isDirectory() ? fs.rmSync(fp, { recursive: true }) : fs.unlinkSync(fp);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/files/rename', adminAuth, (req, res) => {
  try {
    const { from, to } = req.body;
    const src = safePath(from);
    const dst = path.join(path.dirname(src), path.basename(to));
    if (!dst.startsWith(ROOT)) throw new Error('Acesso negado');
    fs.renameSync(src, dst);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Security ----
router.get('/security', adminAuth, (req, res) => {
  const sec = loadSecurity();
  try {
    const users = JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf-8'));
    sec.activeSessions = users.filter(u => u.token).map(u => ({
      id: u.id, nome: u.nome, email: u.email, lastLogin: u.lastLogin || null
    }));
  } catch { sec.activeSessions = []; }
  res.json(sec);
});

router.post('/security/block', adminAuth, (req, res) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP obrigatório' });
  const sec = loadSecurity();
  if (!sec.blockedIPs.find(b => b.ip === ip)) {
    sec.blockedIPs.push({ ip, reason: reason || 'Bloqueado manualmente', at: new Date().toISOString() });
    saveSecurity(sec);
  }
  res.json({ ok: true });
});

router.delete('/security/block/:ip', adminAuth, (req, res) => {
  const sec = loadSecurity();
  sec.blockedIPs = sec.blockedIPs.filter(b => b.ip !== decodeURIComponent(req.params.ip));
  saveSecurity(sec);
  res.json({ ok: true });
});

router.delete('/security/session/:id', adminAuth, (req, res) => {
  try {
    const users = JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf-8'));
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
    users[idx].token = null;
    fs.writeFileSync(path.join(DATA, 'users.json'), JSON.stringify(users, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Notifications ----
router.get('/notifications', adminAuth, (req, res) => {
  res.json((loadSecurity().notifications || []).slice(0, 100));
});

router.post('/notifications/read-all', adminAuth, (req, res) => {
  const sec = loadSecurity();
  (sec.notifications || []).forEach(n => { n.read = true; });
  saveSecurity(sec);
  res.json({ ok: true });
});

router.delete('/notifications/:id', adminAuth, (req, res) => {
  const sec = loadSecurity();
  sec.notifications = (sec.notifications || []).filter(n => n.id !== req.params.id);
  saveSecurity(sec);
  res.json({ ok: true });
});

// ---- Maintenance ----
router.get('/maintenance', (req, res) => res.json({ maintenance: loadConfig().maintenance || false }));

router.post('/maintenance/toggle', adminAuth, (req, res) => {
  const cfg = loadConfig();
  cfg.maintenance = !cfg.maintenance;
  saveConfig(cfg);
  res.json({ maintenance: cfg.maintenance });
});

// ---- Users ----
router.get('/users', adminAuth, (req, res) => {
  try {
    const users = JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf-8'));
    res.json(users.map(u => ({ id: u.id, nome: u.nome, email: u.email, whatsapp: u.whatsapp, role: u.role || 'user', createdAt: u.createdAt, active: !!u.token })));
  } catch { res.json([]); }
});

router.put('/users/:id/role', adminAuth, (req, res) => {
  const { role } = req.body;
  if (!['user','admin','superadmin'].includes(role)) return res.status(400).json({ error: 'Role inválido' });
  try {
    const users = JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf-8'));
    const idx = users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
    users[idx].role = role;
    fs.writeFileSync(path.join(DATA, 'users.json'), JSON.stringify(users, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.loadConfig = loadConfig;
module.exports.loadSecurity = loadSecurity;
module.exports.saveSecurity = saveSecurity;
