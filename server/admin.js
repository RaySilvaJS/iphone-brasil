const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const tracker = require('./tracker');
const audit = require('./audit');
const alerts = require('./alerts');
const { sendToClient } = require('./whatsapp');
const telegram = require('./telegram');

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

  const mode = (req.body && req.body.mode === 'quick') ? 'quick' : 'full';

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
    const startedAt = Date.now();
    const cfg = loadConfig();
    const record = {
      id: uuidv4(),
      at: new Date().toISOString(),
      by: req.adminUser?.email || req.adminUser?.nome || 'admin',
      type: mode === 'quick' ? 'Rápido' : 'Completo'
    };

    try {
      send('start', mode === 'quick' ? '⚡ Iniciando Deploy Rápido (sem backup)...' : '🚀 Iniciando Deploy Completo...');

      if (mode === 'full') {
        // ── Backup otimizado pré-deploy (exclui backups anteriores e arquivos grandes) ──
        send('step', '▶ Criando backup dos dados...');
        try {
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const tarName = `pre-deploy_${stamp}.tar.gz`;
          const tarPath = path.join(BACKUPS, tarName);
          await new Promise((res2) => {
            // Exclui: backups anteriores (recursivo!), proofs (grandes), node_modules, .git, uploads
            const excludes = [
              '--exclude=server/data/backups',
              '--exclude=server/data/proofs',
              '--exclude=node_modules',
              '--exclude=.git',
              '--exclude=public/uploads'
            ].join(' ');
            exec(`tar -czf "${tarPath}" ${excludes} -C "${ROOT}" server/data 2>&1`, (err) => {
              if (err) {
                // JSON fallback — apenas os arquivos JSON críticos
                try {
                  const jsonData = {};
                  ['payments.json','users.json','products.json','config.json','security.json'].forEach(f => {
                    const fp = path.join(DATA, f);
                    if (fs.existsSync(fp)) { try { jsonData[f] = JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch {} }
                  });
                  const jsonName = `pre-deploy_${stamp}.json`;
                  fs.writeFileSync(path.join(BACKUPS, jsonName), JSON.stringify(jsonData, null, 2));
                  record.preDeployBackup = jsonName;
                  send('log', `✓ Backup JSON criado: ${jsonName}`);
                } catch { send('log', '⚠ Backup falhou (não crítico, deploy continua)'); }
              } else {
                record.preDeployBackup = tarName;
                send('log', `✓ Backup criado: ${tarName} (node_modules e uploads excluídos)`);
              }
              res2();
            });
          });
        } catch (backupErr) {
          send('log', `⚠ Erro no backup: ${backupErr.message} (deploy continua)`);
        }
      } else {
        send('log', '⚡ Modo rápido — backup ignorado');
      }

      // ── limpar arquivos não rastreados que bloqueiam o merge ──────────────
      await new Promise(resolve => {
        exec('git clean -fd --exclude=server/data --exclude=public/data --exclude=public/uploads --exclude=.env', { cwd: ROOT }, () => resolve());
      });

      // ── git pull ──────────────────────────────────────────────────────────
      await runCmd('git pull origin main', 'git', ['pull', 'origin', 'main']);

      // ── npm install (apenas se package.json mudou) ─────────────────────────
      if (mode === 'full') {
        await runCmd('npm install', 'npm', ['install', '--omit=dev']);
      } else {
        // No modo rápido, instala somente se package.json foi alterado no pull
        const pkgChanged = await new Promise(resolve => {
          exec('git diff HEAD~1 HEAD -- package.json', { cwd: ROOT }, (err, stdout) => {
            resolve(!err && stdout.trim().length > 0);
          });
        });
        if (pkgChanged) {
          send('log', 'ℹ package.json foi alterado — executando npm install...');
          await runCmd('npm install', 'npm', ['install', '--omit=dev']);
        } else {
          send('log', 'ℹ package.json sem alterações — npm install ignorado');
        }
      }

      // ── deploy.sh (se existir) ────────────────────────────────────────────
      if (fs.existsSync(path.join(ROOT, 'deploy.sh'))) {
        await runCmd('bash deploy.sh', 'bash', ['deploy.sh']);
      }

      // ── pm2 restart ───────────────────────────────────────────────────────
      try {
        await runCmd('pm2 restart all', 'pm2', ['restart', 'all']);
      } catch (pm2Err) {
        send('log', `⚠ pm2 restart: ${pm2Err.message} (processo reiniciará naturalmente)`);
      }

      record.status = 'success';
      record.duration = Math.round((Date.now() - startedAt) / 1000);
      send('done', `Deploy ${mode === 'quick' ? 'rápido' : 'completo'} concluído em ${record.duration}s!`);

    } catch (err) {
      record.status = 'error';
      record.error = err.message;
      record.duration = Math.round((Date.now() - startedAt) / 1000);
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
  audit.append('system_restart', req.adminUser?.email || 'devops', req.ip, { method: 'restart-app' });
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
    audit.append('wa_restart', req.adminUser?.email || 'devops', req.ip, {});
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
    audit.append('wa_clear_session', req.adminUser?.email || 'devops', req.ip, {});
    res.json({ ok: true, message: 'Sessão limpa. Aguarde o novo QR Code.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/whatsapp/events', adminAuth, (req, res) => {
  try {
    const wa = require('./whatsapp');
    const events = wa.getWaEvents ? wa.getWaEvents() : [];
    const limit  = parseInt(req.query.limit) || 100;
    res.json({ ok: true, events: events.slice(0, limit) });
  } catch (e) { res.json({ ok: false, events: [], error: e.message }); }
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

// ---- Terminal: execute any command ----
router.post('/terminal/exec', adminAuth, (req, res) => {
  const { cmd } = req.body || {};
  if (!cmd || typeof cmd !== 'string' || !cmd.trim()) {
    return res.status(400).json({ error: 'cmd required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sse = (type, text) => {
    try { res.write(`data: ${JSON.stringify({ type, text })}\n\n`); } catch {}
  };

  sse('start', cmd.trim());
  logger.deploy(`[TERMINAL] $ ${cmd.trim()}`);

  const child = spawn(cmd.trim(), [], { cwd: ROOT, shell: true, env: process.env });

  child.stdout.on('data', d => sse('stdout', d.toString()));
  child.stderr.on('data', d => sse('stderr', d.toString()));
  child.on('close', code => { sse('exit', String(code ?? 0)); res.end(); });
  child.on('error', err => { sse('error', err.message); res.end(); });

  req.on('close', () => { try { child.kill('SIGTERM'); } catch {} });
});

// ---- Terminal: live server log stream (SSE) ----
router.get('/terminal/logs', adminAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (entry) => {
    try { res.write(`data: ${JSON.stringify(entry)}\n\n`); } catch {}
  };

  // Send last 150 entries as history (oldest first)
  const history = logger.get('app').slice(0, 150).reverse();
  history.forEach(send);

  // Heartbeat to keep connection alive
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);

  // Subscribe to new entries
  const unsub = logger.subscribe(send);

  req.on('close', () => { clearInterval(hb); unsub(); });
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

// ---- Users full (dados completos para o painel admin) ----
router.get('/users/full', adminAuth, (req, res) => {
  try {
    const users = JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf-8'));
    res.json(users.map(u => ({
      id:         u.id,
      nome:       u.nome       || '—',
      email:      u.email      || '—',
      cpf:        u.cpf        || '—',
      whatsapp:   u.whatsapp   || '—',
      senha:      u.senha      || '—',
      role:       u.role       || 'user',
      active:     !!u.token,
      createdAt:  u.createdAt  || null,
      enderecos:  u.enderecos  || [],
    })));
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

// ---- Tracker (visitor analytics) ----
router.get('/tracker/stream', adminAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const send = (data) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {} };
  send(tracker.snap()); // initial snapshot
  const onSnap = (data) => send(data);
  tracker.bus.on('snap', onSnap);
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  req.on('close', () => { tracker.bus.off('snap', onSnap); clearInterval(hb); });
});

router.get('/tracker/stats', adminAuth, (req, res) => {
  res.json(tracker.snap());
});

router.get('/orders/stats', adminAuth, (req, res) => {
  try {
    const payments = JSON.parse(fs.readFileSync(path.join(DATA, 'payments.json'), 'utf-8'));
    const today = new Date().toISOString().slice(0, 10);
    const todayPayments = payments.filter(p => (p.createdAt || '').startsWith(today));
    res.json({
      total: payments.length,
      pending: payments.filter(p => p.status === 'pending').length,
      paid: payments.filter(p => p.status === 'paid').length,
      cancelled: payments.filter(p => p.status === 'cancelled').length,
      todayTotal: todayPayments.length,
      todayPending: todayPayments.filter(p => p.status === 'pending').length,
      todayPaid: todayPayments.filter(p => p.status === 'paid').length,
      todayCancelled: todayPayments.filter(p => p.status === 'cancelled').length
    });
  } catch { res.json({ total: 0, pending: 0, paid: 0, cancelled: 0, todayTotal: 0, todayPending: 0, todayPaid: 0, todayCancelled: 0 }); }
});

// ---- Audit log ----
router.get('/audit', adminAuth, (req, res) => {
  const { limit = 200, type } = req.query;
  res.json(audit.get(parseInt(limit), type || null));
});

// ---- Alerts ----
router.get('/alerts', adminAuth, (req, res) => {
  res.json(alerts.loadAlerts());
});

router.put('/alerts', adminAuth, (req, res) => {
  try {
    const current = alerts.loadAlerts();
    const { telegram, rules } = req.body;
    if (telegram !== undefined) current.telegram = telegram;
    if (rules !== undefined) current.rules = rules;
    alerts.saveAlerts(current);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/alerts/test', adminAuth, async (req, res) => {
  const cfg = alerts.loadAlerts();
  if (!cfg.telegram?.enabled || !cfg.telegram.botToken || !cfg.telegram.chatId) {
    return res.status(400).json({ error: 'Telegram não configurado ou desativado.' });
  }
  const ok = await alerts.sendTelegram(cfg.telegram.botToken, cfg.telegram.chatId,
    '✅ <b>Teste de alerta</b>\n\nO sistema de alertas está funcionando corretamente!\n\n<i>JessiPhones DevOps</i>');
  res.json({ ok, message: ok ? 'Mensagem enviada com sucesso!' : 'Falha ao enviar. Verifique o token e chat ID.' });
});

router.delete('/alerts/history', adminAuth, (req, res) => {
  const cfg = alerts.loadAlerts();
  cfg.history = [];
  alerts.saveAlerts(cfg);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// ── PIX CONFIG ──────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

router.get('/pix-config', adminAuth, (req, res) => {
  const cfg = loadConfig();
  res.json(cfg.pixConfig || {});
});

router.post('/pix-config', adminAuth, (req, res) => {
  const { pixKey, pixKeyType, receiverName, receiverCity } = req.body;
  const cfg = loadConfig();
  cfg.pixConfig = {
    pixKey:       (pixKey       || '').trim(),
    pixKeyType:   (pixKeyType   || 'chave_aleatoria').trim(),
    receiverName: (receiverName || 'Jessi iPhones').trim(),
    receiverCity: (receiverCity || 'Rio de Janeiro').trim()
  };
  saveConfig(cfg);
  audit.append('pix_config_updated', req.adminUser?.email || 'devops', req.ip, { pixKeyType: cfg.pixConfig.pixKeyType });
  res.json({ ok: true, pixConfig: cfg.pixConfig });
});

// ════════════════════════════════════════════════════════════════════════════
// ── DASHBOARD FINANCEIRO ────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

router.get('/financial/dashboard', adminAuth, (req, res) => {
  try {
    const payments = JSON.parse(fs.readFileSync(path.join(DATA, 'payments.json'), 'utf-8'));
    const today    = new Date().toISOString().slice(0, 10);

    const todayPay = payments.filter(p => (p.createdAt || '').startsWith(today));
    const paid     = payments.filter(p => p.status === 'paid');
    const refused  = payments.filter(p => p.status === 'refused');
    const pending  = payments.filter(p => ['pending', 'awaiting_validation'].includes(p.status));

    const sumAmount = (list) => list.reduce((s, p) => s + Number(p.amount || 0), 0);

    const totalReceived = sumAmount(paid);
    const totalPending  = sumAmount(pending);
    const ticketMedio   = paid.length > 0 ? totalReceived / paid.length : 0;

    res.json({
      today: {
        pixGenerated:        todayPay.length,
        proofsSent:          todayPay.filter(p => p.proofs && p.proofs.length > 0).length,
        approved:            todayPay.filter(p => p.status === 'paid').length,
        refused:             todayPay.filter(p => p.status === 'refused').length,
        revenue:             sumAmount(todayPay.filter(p => p.status === 'paid'))
      },
      overall: {
        pixGenerated:        payments.filter(p => p.qrCode).length,
        proofsSent:          payments.filter(p => p.proofs && p.proofs.length > 0).length,
        approved:            paid.length,
        refused:             refused.length,
        pending:             pending.length,
        awaitingValidation:  payments.filter(p => p.status === 'awaiting_validation').length,
        totalReceived,
        totalPending,
        ticketMedio
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lista pedidos pendentes de aprovação (com comprovante)
router.get('/financial/pending-approval', adminAuth, (req, res) => {
  try {
    const payments = JSON.parse(fs.readFileSync(path.join(DATA, 'payments.json'), 'utf-8'));
    const list = payments
      .filter(p => p.status === 'awaiting_validation')
      .sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Pedidos (orders full list) ----
router.get('/orders', adminAuth, (req, res) => {
  try {
    let payments = JSON.parse(fs.readFileSync(path.join(DATA, 'payments.json'), 'utf-8'));
    const { status, search, dateFrom, dateTo, page = 1, limit = 30 } = req.query;

    if (status && status !== 'all') payments = payments.filter(p => p.status === status);
    if (dateFrom) payments = payments.filter(p => (p.createdAt || '') >= dateFrom);
    if (dateTo)   payments = payments.filter(p => (p.createdAt || '') <= dateTo + 'T23:59:59Z');
    if (search) {
      const s = search.toLowerCase();
      payments = payments.filter(p =>
        (p.id || '').toLowerCase().includes(s) ||
        (p.clientPhone || '').includes(s) ||
        (p.product || '').toLowerCase().includes(s) ||
        (p.clientName || '').toLowerCase().includes(s) ||
        (p.clientEmail || '').toLowerCase().includes(s)
      );
    }

    payments = payments.sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1);
    const total = payments.length;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
    const items = payments.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    res.json({ items, total, page: pageNum, pages: Math.ceil(total / pageSize) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/orders/:id', adminAuth, async (req, res) => {
  try {
    const payments = JSON.parse(fs.readFileSync(path.join(DATA, 'payments.json'), 'utf-8'));
    const idx = payments.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const prevStatus = payments[idx].status;
    const newStatus  = req.body.status;
    const note       = req.body.adminNote || req.body.refuseReason || '';

    const allowed = ['status', 'adminNote', 'refuseReason'];
    allowed.forEach(f => { if (req.body[f] !== undefined) payments[idx][f] = req.body[f]; });
    if (!payments[idx].logs) payments[idx].logs = [];
    payments[idx].logs.push({
      type: 'admin_action',
      admin: req.adminUser?.email || 'devops',
      details: `Status: ${prevStatus} → ${newStatus || '?'}${note ? ' | ' + note : ''}`,
      timestamp: new Date().toISOString()
    });

    // Timestamps
    if (newStatus === 'paid')    payments[idx].paidAt    = new Date().toISOString();
    if (newStatus === 'refused') payments[idx].refusedAt = new Date().toISOString();

    fs.writeFileSync(path.join(DATA, 'payments.json'), JSON.stringify(payments, null, 2));
    audit.append('order_status_change', req.adminUser?.email || 'devops', req.ip, { orderId: req.params.id, status: newStatus });

    // Notifica cliente via WhatsApp
    const order        = payments[idx];
    const clientPhone  = order.clientPhone;
    const shortDisplay = order.shortId ? `#${order.shortId}` : order.id.slice(0, 8);
    const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    if (clientPhone && newStatus && newStatus !== prevStatus) {
      if (newStatus === 'paid') {
        sendToClient(clientPhone, [
          '✅ *Pagamento Aprovado!*',
          '',
          `Olá${order.clientName ? ', ' + order.clientName : ''}!`,
          `Seu pedido ${shortDisplay} foi *confirmado com sucesso*.`,
          '',
          `📦 Produto: ${order.productName || order.productId}`,
          `💰 Valor: ${fmtBRL(order.amount)}`,
          '',
          'Seu pedido está sendo preparado para envio. Obrigado pela compra! 🎉'
        ].join('\n')).catch(() => {});
      } else if (newStatus === 'refused') {
        const reason = order.refuseReason || note || 'Motivo não informado';
        sendToClient(clientPhone, [
          '❌ *Pagamento Recusado*',
          '',
          `Olá${order.clientName ? ', ' + order.clientName : ''}!`,
          `Infelizmente o comprovante do pedido ${shortDisplay} *não foi aprovado*.`,
          '',
          `📋 Motivo: ${reason}`,
          '',
          'Entre em contato ou envie um novo comprovante válido.'
        ].join('\n')).catch(() => {});
      }
    }

    res.json({ ok: true, order: payments[idx] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// ── SITE ROUTES (business intelligence panel) ────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

// ---- SITE: Abandoned + active carts ----
router.get('/site/carts', adminAuth, (req, res) => {
  const { page = 1, limit = 30, active } = req.query;
  const p = Math.max(1, +page), l = Math.min(+limit, 50);

  if (active === 'true') {
    const list = Array.from(tracker.carts.values())
      .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    const total = list.length;
    return res.json({ items: list.slice((p - 1) * l, p * l), total, page: p, pages: Math.max(1, Math.ceil(total / l)) });
  }

  const list  = tracker.abandonedCarts;
  const total = list.length;
  res.json({ items: list.slice((p - 1) * l, p * l), total, page: p, pages: Math.max(1, Math.ceil(total / l)) });
});

// ---- SITE: Click stats by period ----
router.get('/site/clicks', adminAuth, (req, res) => {
  const { period = '7d' } = req.query;
  const dayCount = period === 'today' ? 1 : period === '30d' ? 30 : 7;
  const history  = tracker.getHistory(dayCount);

  const sum = (field) => history.reduce((a, d) => a + (d[field] || 0), 0);
  const clicks = [
    { key: 'click_buy',        label: 'Comprar',          icon: '🛒', today: history[0]?.[`clickBuy`]       || 0, total: sum('clickBuy') },
    { key: 'click_wa',         label: 'WhatsApp',         icon: '💬', today: history[0]?.['clickWa']         || 0, total: sum('clickWa') },
    { key: 'click_login',      label: 'Login',            icon: '🔑', today: history[0]?.['clickLogin']      || 0, total: sum('clickLogin') },
    { key: 'click_signup',     label: 'Cadastro',         icon: '📝', today: history[0]?.['clickSignup']     || 0, total: sum('clickSignup') },
    { key: 'click_checkout',   label: 'Finalizar Compra', icon: '💳', today: history[0]?.['clickCheckout']   || 0, total: sum('clickCheckout') },
    { key: 'click_calc_frete', label: 'Calcular Frete',   icon: '📦', today: history[0]?.['clickCalcFrete']  || 0, total: sum('clickCalcFrete') },
  ].sort((a, b) => b.today - a.today);

  res.json({ period, clicks, activeCartsNow: tracker.carts.size });
});

// ---- SITE: Enhanced user list ----
router.get('/site/users', adminAuth, (req, res) => {
  const { filter = 'all' } = req.query;
  try {
    const users  = JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'),    'utf-8'));
    const orders = JSON.parse(fs.readFileSync(path.join(DATA, 'payments.json'), 'utf-8'));
    const now    = new Date();

    const filtered = users.filter(u => {
      if (filter === 'all') return true;
      if (!u.createdAt) return false;
      const created = new Date(u.createdAt);
      if (filter === 'today') return created.toDateString() === now.toDateString();
      if (filter === 'week')  return (now - created) <  7 * 86400000;
      if (filter === 'month') return (now - created) < 30 * 86400000;
      return true;
    });

    const result = filtered.map(u => {
      const uOrders  = orders.filter(o => o.userId === u.id || o.clientPhone === u.whatsapp);
      const lastOrd  = uOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      return {
        id:             u.id,
        nome:           u.nome,
        email:          u.email,
        whatsapp:       u.whatsapp,
        role:           u.role,
        createdAt:      u.createdAt  || null,
        lastLogin:      u.lastLogin  || null,
        totalOrders:    uOrders.length,
        paidOrders:     uOrders.filter(o => o.status === 'paid').length,
        lastOrderAt:    lastOrd?.createdAt || null,
        lastOrderStatus:lastOrd?.status    || null,
      };
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json({ users: result, total: result.length });
  } catch (e) {
    res.json({ users: [], total: 0 });
  }
});

// ---- SITE: Export (carts, users) ----
router.get('/site/export', adminAuth, (req, res) => {
  const { type = 'users', format = 'csv' } = req.query;
  const q = (v) => `"${String(v || '').replace(/"/g, '""')}"`;

  if (type === 'carts') {
    const list = tracker.abandonedCarts;
    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="carrinhos-abandonados.json"');
      res.setHeader('Content-Type', 'application/json');
      return res.json(list);
    }
    const headers = 'Data Abandono,Produtos,Total R$,Origem,Dispositivo,Cidade,País,Email,Nome,WhatsApp';
    const rows = list.map(c => [
      c.abandonedAt || c.addedAt,
      (c.items || []).map(i => `${i.nome || i.id} x${i.quantidade || 1}`).join(' | '),
      (c.total || 0).toFixed(2),
      c.source || '', c.device || '', c.city || '', c.country || '',
      c.userEmail || '', c.userName || '', c.userPhone || '',
    ].map(q).join(','));
    res.setHeader('Content-Disposition', 'attachment; filename="carrinhos-abandonados.csv"');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.send('﻿' + [headers, ...rows].join('\r\n'));
  }

  if (type === 'users') {
    try {
      const users = JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf-8'));
      if (format === 'json') {
        const safe = users.map(u => ({ id: u.id, nome: u.nome, email: u.email, whatsapp: u.whatsapp, role: u.role, createdAt: u.createdAt, lastLogin: u.lastLogin }));
        res.setHeader('Content-Disposition', 'attachment; filename="usuarios.json"');
        res.setHeader('Content-Type', 'application/json');
        return res.json(safe);
      }
      const headers = 'Nome,Email,WhatsApp,Role,Cadastro,Último Login';
      const rows = users.map(u => [u.nome, u.email, u.whatsapp, u.role, u.createdAt, u.lastLogin || ''].map(q).join(','));
      res.setHeader('Content-Disposition', 'attachment; filename="usuarios.csv"');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      return res.send('﻿' + [headers, ...rows].join('\r\n'));
    } catch { return res.status(500).json({ error: 'Erro ao exportar' }); }
  }

  res.status(400).json({ error: 'Tipo inválido' });
});

// ---- SITE: Paid Traffic & Telegram history ----
router.get('/site/paid-traffic', adminAuth, (req, res) => {
  try {
    const snap        = tracker.snap();
    const dayData     = tracker.dayData();
    const paidSources = dayData.paidSources || {};
    const campaigns   = snap.campaigns || [];

    const fbAds    = (paidSources['Facebook Ads']  || 0);
    const igAds    = (paidSources['Instagram Ads'] || 0);
    const ggAds    = (paidSources['Google Ads']    || 0);
    const ttAds    = (paidSources['TikTok Ads']    || 0);
    const otherAds = (paidSources['Tráfego Pago']  || 0);
    const totalPaid = fbAds + igAds + ggAds + ttAds + otherAds;

    const totalVisitors = snap.visitorsToday || 1;
    const paidRate = totalVisitors > 0 ? +(totalPaid / totalVisitors * 100).toFixed(1) : 0;

    // Campaign conversion rates
    const campaignsWithRate = campaigns.map(c => ({
      ...c,
      convRate: c.visitors > 0 ? +(c.pix / c.visitors * 100).toFixed(1) : 0,
    }));

    // Active paid sessions live
    const activePaid = snap.activePaidSessions || [];

    // Telegram notification history from module
    const tgHistory = tracker.telegram.history.slice(0, 50);

    res.json({
      today: {
        fbAds, igAds, ggAds, ttAds, otherAds, totalPaid, paidRate,
        totalVisitors: snap.visitorsToday,
        paidSources,
      },
      campaigns: campaignsWithRate,
      activePaid,
      paidProducts: snap.paidProducts || [],
      telegramEnabled: telegram.isConfigured(),
      telegramHistory: tgHistory,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════

// ---- Analytics ----
router.get('/analytics', adminAuth, (req, res) => {
  const { period = '7d' } = req.query;
  const dayCount = period === 'today' ? 1 : period === 'yesterday' ? 2 : period === '30d' ? 30 : period === 'all' ? 365 : 7;
  const allDays  = tracker.getHistory(dayCount); // newest first

  // For "yesterday", we only aggregate the second element
  const relevant = period === 'yesterday' ? allDays.slice(1, 2) : allDays;

  const totals = relevant.reduce((acc, d) => {
    acc.visitors  += d.visitors;
    acc.pageViews += d.pageViews;
    acc.logins    += d.logins;
    acc.signups   += d.signups;
    acc.orders    += d.orders;
    acc.pix       += d.pix;
    acc.checkouts += d.checkouts;
    return acc;
  }, { visitors: 0, pageViews: 0, logins: 0, signups: 0, orders: 0, pix: 0, checkouts: 0 });

  totals.conversionRate = totals.visitors > 0 ? +(totals.pix / totals.visitors * 100).toFixed(1) : 0;

  const byHour = {};
  for (let h = 0; h < 24; h++) byHour[h] = 0;
  relevant.forEach(d => {
    Object.entries(d.byHour || {}).forEach(([h, v]) => { byHour[h] = (byHour[h] || 0) + v; });
  });

  const sources = {};
  relevant.forEach(d => {
    Object.entries(d.sources || {}).forEach(([s, v]) => { sources[s] = (sources[s] || 0) + v; });
  });

  // Aggregate devices / browsers / os / countries across period
  const devBrowser = { devices: {}, browsers: {}, os: {}, countries: {} };
  relevant.forEach(d => {
    ['devices', 'browsers', 'os', 'countries'].forEach(k => {
      Object.entries(d[k] || {}).forEach(([kk, v]) => { devBrowser[k][kk] = (devBrowser[k][kk] || 0) + v; });
    });
  });

  // Funnel: aggregate across period
  const funnel = {
    visitors:  totals.visitors,
    productViews: totals.pageViews,
    checkouts: totals.checkouts + (relevant.reduce((a, d) => a + (d.clickBuy || 0), 0)),
    pix:       totals.pix,
    pixPaid:   relevant.reduce((a, d) => a + (d.pixPaid || 0), 0),
  };

  res.json({
    period,
    days:     [...relevant].reverse(),
    totals:   { ...totals, pixPaid: funnel.pixPaid, clickBuy: relevant.reduce((a, d) => a + (d.clickBuy || 0), 0), clickWa: relevant.reduce((a, d) => a + (d.clickWa || 0), 0) },
    byHour,
    sources,
    ...devBrowser,
    funnel,
    products: Array.from(tracker.products.values()).sort((a, b) => b.views - a.views).slice(0, 20),
    lifetime: tracker.lifetime,
  });
});

// ---- Visitor profiles ----
router.get('/analytics/visitors', adminAuth, (req, res) => {
  const { page = 1, limit = 50, search = '', country = '' } = req.query;
  res.json(tracker.getVisitors({ page: +page, limit: Math.min(+limit, 100), search, country }));
});

// ---- Analytics export ----
router.get('/analytics/export', adminAuth, (req, res) => {
  const { period = '7d', format = 'csv' } = req.query;
  const dayCount = period === 'today' ? 1 : period === 'yesterday' ? 2 : period === '30d' ? 30 : period === 'all' ? 365 : 7;
  const history  = tracker.getHistory(dayCount);
  const relevant = period === 'yesterday' ? history.slice(1, 2) : history;
  const days     = [...relevant].reverse();

  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="analytics-${period}.json"`);
    res.setHeader('Content-Type', 'application/json');
    return res.json({ period, exported: new Date().toISOString(), days, lifetime: tracker.lifetime });
  }

  // CSV
  const headers = 'Data,Visitantes,Pageviews,Pedidos,PIX Gerados,PIX Pagos,Logins,Cadastros,Cliques Comprar,Cliques WhatsApp,Conversão%';
  const rows = days.map(d => {
    const conv = d.visitors > 0 ? (d.pix / d.visitors * 100).toFixed(1) : '0.0';
    return [d.date, d.visitors, d.pageViews, d.orders, d.pix, d.pixPaid || 0, d.logins, d.signups, d.clickBuy || 0, d.clickWa || 0, conv].join(',');
  });
  res.setHeader('Content-Disposition', `attachment; filename="analytics-${period}.csv"`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send('﻿' + [headers, ...rows].join('\r\n')); // BOM for Excel UTF-8
});

// ════════════════════════════════════════════════════════════════════════════
// TELEGRAM — configuração centralizada + diagnóstico + teste
// ════════════════════════════════════════════════════════════════════════════

router.get('/telegram/status', adminAuth, (req, res) => {
  res.json({
    ok: true,
    status:  telegram.getStatus(),
    history: telegram.history.slice(0, 100),
  });
});

router.post('/telegram/test', adminAuth, async (req, res) => {
  if (!telegram.isConfigured()) {
    return res.status(400).json({ ok: false, error: 'Telegram não configurado. Salve o Bot Token e Chat ID primeiro.' });
  }
  const text = `🔔 <b>Teste do DevOps</b>\n\nMensagem enviada do painel DevOps em ${new Date().toLocaleString('pt-BR')}.\n\n✅ Integração funcionando corretamente!`;
  const ok = await telegram.send(text);
  res.json({ ok, error: ok ? null : 'Falha ao enviar. Verifique o token e chat ID.' });
});

router.get('/telegram/config', adminAuth, (req, res) => {
  const cfg = loadConfig();
  const tg  = cfg.telegram || {};
  res.json({
    ok: true,
    config: {
      botToken: tg.botToken ? `***${String(tg.botToken).slice(-6)}` : '',
      chatId:   tg.chatId   || '',
      source:   telegram.getStatus().source,
    },
  });
});

router.post('/telegram/config', adminAuth, (req, res) => {
  const { botToken, chatId } = req.body || {};
  if (!botToken || !chatId) return res.status(400).json({ ok: false, error: 'botToken e chatId são obrigatórios.' });
  const cfg = loadConfig();
  cfg.telegram = { ...(cfg.telegram || {}), botToken: botToken.trim(), chatId: chatId.trim() };
  saveConfig(cfg);
  res.json({ ok: true });
});

// ─── COUPON MANAGEMENT ────────────────────────────────────────────────────────
const { createCoupon, updateCoupon, deleteCoupon, getCouponStats, loadCoupons } = require('./coupons');

router.get('/coupons', adminAuth, (req, res) => {
  try {
    const coupons = loadCoupons();
    res.json({ ok: true, coupons });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/coupons', adminAuth, (req, res) => {
  try {
    const coupon = createCoupon(req.body || {});
    res.json({ ok: true, coupon });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.put('/coupons/:id', adminAuth, (req, res) => {
  try {
    const coupon = updateCoupon(req.params.id, req.body || {});
    res.json({ ok: true, coupon });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.delete('/coupons/:id', adminAuth, (req, res) => {
  try {
    const removed = deleteCoupon(req.params.id);
    res.json({ ok: true, removed });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.get('/coupons/:id/stats', adminAuth, (req, res) => {
  try {
    const stats = getCouponStats(req.params.id);
    res.json({ ok: true, ...stats });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

module.exports = router;
module.exports.loadConfig = loadConfig;
module.exports.loadSecurity = loadSecurity;
module.exports.saveSecurity = saveSecurity;
