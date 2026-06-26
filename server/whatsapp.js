const { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path   = require('path');
const fs     = require('fs');

const paymentsPath   = path.join(__dirname, 'data', 'payments.json');
const WA_EVENTS_PATH = path.join(__dirname, 'data', 'wa-events.json');
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID;

const getTracker = () => { try { return require('./tracker'); } catch { return null; } };
const getAlerts  = () => { try { return require('./alerts');  } catch { return null; } };

const loadPayments  = () => { try { return JSON.parse(fs.readFileSync(paymentsPath, 'utf-8')); } catch { return []; } };
const loadWaEvents  = () => { try { return JSON.parse(fs.readFileSync(WA_EVENTS_PATH, 'utf-8')); } catch { return []; } };

const appendWaEvent = (type, detail = '') => {
  try {
    const events = loadWaEvents();
    events.unshift({ type, detail, ts: new Date().toISOString() });
    fs.writeFileSync(WA_EVENTS_PATH, JSON.stringify(events.slice(0, 1000), null, 2), 'utf-8');
  } catch (e) { console.error('[WA] Erro ao gravar evento:', e.message); }
};
const savePayments = (p) => fs.writeFileSync(paymentsPath, JSON.stringify(p, null, 2), 'utf-8');
const formatBRL    = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const addLog = (payment, entry) => {
  payment.logs = payment.logs || [];
  payment.logs.push({ ...entry, timestamp: new Date().toISOString() });
};

// ── Bot config — gerenciamento pelo grupo admin ───────────────────────────────
const BOT_CONFIG_PATH = path.join(__dirname, 'data', 'bot', 'config.json');

const loadBotCfg = () => {
  try { return JSON.parse(fs.readFileSync(BOT_CONFIG_PATH, 'utf-8')); }
  catch { return { enabled: false, mode: 'allowlist', allowedTestPhones: [], maxRepliesPerMinute: 6, ignoreMessagesOlderThanSeconds: 60, campaignCodes: [], siteUrl: '', conversationTtlDays: 30 }; }
};

const saveBotCfg = (cfg) => {
  try {
    const tmp = BOT_CONFIG_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf-8');
    fs.renameSync(tmp, BOT_CONFIG_PATH);
  } catch (e) { console.error('[BOT-CFG] Erro ao salvar:', e.message); }
};

async function handleBotAdminCommand(sock, groupJid, rawText) {
  const args  = rawText.trim().split(/\s+/);
  const sub   = (args[1] || '').toUpperCase();
  const cfg   = loadBotCfg();
  const reply = (text) => sock.sendMessage(groupJid, { text });

  // ── Menu ──────────────────────────────────────────────────────────────────
  if (!sub || sub === 'MENU' || sub === 'AJUDA') {
    const status = cfg.enabled
      ? `✅ LIGADO (${cfg.mode === 'allowlist' ? 'modo teste' : 'modo público'})`
      : '⛔ DESLIGADO';
    await reply([
      '🤖 *MENU DO BOT — Configuração pelo grupo admin*',
      '',
      `Status atual: ${status}`,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '*Liga/Desliga:*',
      '  BOT ON → liga o bot',
      '  BOT OFF → desliga o bot',
      '  BOT STATUS → ver configuração completa',
      '',
      '*Modo de atendimento:*',
      '  BOT MODO PUBLICO → atende todos os clientes',
      '  BOT MODO TESTE → atende só números da lista',
      '',
      '*Lista de teste (modo teste):*',
      '  BOT TESTE +5521999991234 → adiciona número',
      '  BOT REMOVE +5521999991234 → remove número',
      '  BOT LISTA → exibe todos os números',
      '',
      '*URL da loja (para links clicáveis):*',
      '  BOT URL https://sualore.com.br',
      '',
      '*Campanhas de anúncio:*',
      '  BOT CAMPANHA AD-IP15 MLB123456',
      '  BOT CAMPANHAS → listar campanhas',
      '  BOT REMOVECAMPANHA AD-IP15',
      '',
      '*Outros:*',
      '  BOT LIMITE 10 → máx respostas/min por cliente',
      '━━━━━━━━━━━━━━━━━━━━',
    ].join('\n'));
    return;
  }

  // ── BOT ON ────────────────────────────────────────────────────────────────
  if (sub === 'ON') {
    cfg.enabled = true;
    saveBotCfg(cfg);
    const modeStr = cfg.mode === 'allowlist'
      ? `modo teste (${cfg.allowedTestPhones.length} número(s) na lista)`
      : 'modo público (todos os clientes)';
    await reply(`✅ *Bot ligado* — ${modeStr}\n\nEnvie BOT para ver o menu de comandos.`);
    return;
  }

  // ── BOT OFF ───────────────────────────────────────────────────────────────
  if (sub === 'OFF') {
    cfg.enabled = false;
    saveBotCfg(cfg);
    await reply('⛔ *Bot desligado.*\n\nClientes não receberão mais respostas automáticas.');
    return;
  }

  // ── BOT STATUS ────────────────────────────────────────────────────────────
  if (sub === 'STATUS') {
    const camps = (cfg.campaignCodes || []).filter(c => c.active).length;
    await reply([
      '🤖 *Configuração atual do bot*',
      '━━━━━━━━━━━━━━━━━━━━',
      `Status: ${cfg.enabled ? '✅ LIGADO' : '⛔ DESLIGADO'}`,
      `Modo: ${cfg.mode === 'allowlist' ? 'Teste (allowlist)' : 'Público'}`,
      `Números de teste: ${cfg.allowedTestPhones.length > 0 ? cfg.allowedTestPhones.map(p => '+' + p).join(', ') : '(vazio)'}`,
      `URL da loja: ${cfg.siteUrl || '(não configurada)'}`,
      `Limite/min por cliente: ${cfg.maxRepliesPerMinute}`,
      `Campanhas ativas: ${camps}`,
      `Ignorar msgs com >${cfg.ignoreMessagesOlderThanSeconds}s`,
      '━━━━━━━━━━━━━━━━━━━━',
    ].join('\n'));
    return;
  }

  // ── BOT MODO PUBLICO / MODO TESTE ─────────────────────────────────────────
  if (sub === 'MODO') {
    const modo = (args[2] || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (modo === 'PUBLICO') {
      cfg.mode = 'public';
      saveBotCfg(cfg);
      await reply(`🌐 *Modo público ativado.*\nO bot ${cfg.enabled ? 'responderá' : 'responderá (quando ligado)'} a todos os clientes.`);
    } else if (modo === 'TESTE') {
      cfg.mode = 'allowlist';
      saveBotCfg(cfg);
      const lista = cfg.allowedTestPhones.length > 0 ? cfg.allowedTestPhones.map(p => '+' + p).join(', ') : '(vazio — use BOT TESTE +55...)';
      await reply(`🔒 *Modo teste ativado.*\nApenas números na lista receberão respostas.\n\nLista: ${lista}`);
    } else {
      await reply('Uso:\n  BOT MODO PUBLICO\n  BOT MODO TESTE');
    }
    return;
  }

  // ── BOT TESTE +55... ──────────────────────────────────────────────────────
  if (sub === 'TESTE') {
    const num = (args[2] || '').replace(/\D/g, '');
    if (!num || num.length < 10) {
      await reply('Uso: BOT TESTE +5521999991234\n\nDigite o número com DDI e DDD, somente dígitos.');
      return;
    }
    if (cfg.allowedTestPhones.includes(num)) {
      await reply(`ℹ️ *+${num}* já está na lista de teste.`);
    } else {
      cfg.allowedTestPhones.push(num);
      saveBotCfg(cfg);
      await reply(`✅ *+${num}* adicionado à lista de teste.\n\nLista: ${cfg.allowedTestPhones.map(p => '+' + p).join(', ')}`);
    }
    return;
  }

  // ── BOT REMOVE +55... ─────────────────────────────────────────────────────
  if (sub === 'REMOVE') {
    const num = (args[2] || '').replace(/\D/g, '');
    if (!num) { await reply('Uso: BOT REMOVE +5521999991234'); return; }
    const antes = cfg.allowedTestPhones.length;
    cfg.allowedTestPhones = cfg.allowedTestPhones.filter(p => p !== num);
    if (cfg.allowedTestPhones.length < antes) {
      saveBotCfg(cfg);
      const lista = cfg.allowedTestPhones.length > 0 ? cfg.allowedTestPhones.map(p => '+' + p).join(', ') : '(vazio)';
      await reply(`✅ *+${num}* removido.\n\nLista: ${lista}`);
    } else {
      await reply(`ℹ️ *${num}* não estava na lista.`);
    }
    return;
  }

  // ── BOT LISTA ─────────────────────────────────────────────────────────────
  if (sub === 'LISTA') {
    if (cfg.allowedTestPhones.length === 0) {
      await reply('Lista de teste vazia.\n\nUse: BOT TESTE +5521999991234');
    } else {
      await reply(`📱 *Números na lista de teste:*\n\n${cfg.allowedTestPhones.map((p, i) => `${i + 1}. +${p}`).join('\n')}`);
    }
    return;
  }

  // ── BOT URL https://... ───────────────────────────────────────────────────
  if (sub === 'URL') {
    const url = (args[2] || '').trim().replace(/\/$/, '');
    if (!url.startsWith('http')) {
      await reply('Uso: BOT URL https://sualore.com.br');
      return;
    }
    cfg.siteUrl = url;
    saveBotCfg(cfg);
    await reply(`✅ URL configurada: *${url}*\nLinks de produtos usarão esta URL.`);
    return;
  }

  // ── BOT LIMITE N ──────────────────────────────────────────────────────────
  if (sub === 'LIMITE') {
    const n = parseInt(args[2], 10);
    if (!n || n < 1 || n > 60) { await reply('Uso: BOT LIMITE 10\n(valor entre 1 e 60)'); return; }
    cfg.maxRepliesPerMinute = n;
    saveBotCfg(cfg);
    await reply(`✅ Limite: *${n} respostas/min* por cliente.`);
    return;
  }

  // ── BOT CAMPANHA AD-XX MLB123 ─────────────────────────────────────────────
  if (sub === 'CAMPANHA') {
    const code   = (args[2] || '').toUpperCase();
    const prodId = (args[3] || '').trim();
    if (!code || !prodId) {
      await reply('Uso: BOT CAMPANHA AD-IP15 MLB1027172667\n\nCódigo + ID do produto.');
      return;
    }
    cfg.campaignCodes = cfg.campaignCodes || [];
    const idx   = cfg.campaignCodes.findIndex(c => c.code === code);
    const entry = { code, active: true, source: 'Anúncio', productId: prodId };
    if (idx >= 0) { cfg.campaignCodes[idx] = entry; } else { cfg.campaignCodes.push(entry); }
    saveBotCfg(cfg);
    await reply(`✅ Campanha *${code}* → produto *${prodId}*\n\nCliente que enviar "${code}" recebe esse produto.`);
    return;
  }

  // ── BOT CAMPANHAS ─────────────────────────────────────────────────────────
  if (sub === 'CAMPANHAS') {
    const camps = cfg.campaignCodes || [];
    if (camps.length === 0) {
      await reply('Nenhuma campanha.\n\nUse: BOT CAMPANHA AD-IP15 MLB123456');
    } else {
      const lines = ['📣 *Campanhas cadastradas:*', ''];
      camps.forEach((c, i) => lines.push(`${i + 1}. *${c.code}* → ${c.productId} ${c.active ? '✅' : '⛔'}`));
      await reply(lines.join('\n'));
    }
    return;
  }

  // ── BOT REMOVECAMPANHA AD-XX ──────────────────────────────────────────────
  if (sub === 'REMOVECAMPANHA') {
    const code = (args[2] || '').toUpperCase();
    if (!code) { await reply('Uso: BOT REMOVECAMPANHA AD-IP15'); return; }
    const antes = (cfg.campaignCodes || []).length;
    cfg.campaignCodes = (cfg.campaignCodes || []).filter(c => c.code !== code);
    if (cfg.campaignCodes.length < antes) {
      saveBotCfg(cfg);
      await reply(`✅ Campanha *${code}* removida.`);
    } else {
      await reply(`ℹ️ Campanha *${code}* não encontrada.`);
    }
    return;
  }

  // ── Desconhecido ──────────────────────────────────────────────────────────
  await reply('Comando não reconhecido.\n\nEnvie *BOT* para ver o menu de comandos.');
}

// ── Estado persistente ────────────────────────────────────────────────────────
const state = {
  status: 'disconnected',
  qr: null, qrAt: null, lastQrScannedAt: null,
  phone: null, name: null, connectedAt: null, lastSeen: null,
  reconnects: 0, disconnects: 0, lastError: null, lastDisconnectReason: null,
  startedAt: new Date().toISOString()
};

let _reconnectTimer  = null;
let _isInitializing  = false;
let _reconnectDelay  = 5000;
const authInfoPath   = path.join(__dirname, 'auth_info');
let socketInstance   = null;
let _lastSaveCreds   = Promise.resolve(); // rastreia o último saveCreds em andamento

// ── Converte telefone brasileiro para JID do WhatsApp (E.164 com DDI 55) ─────
// O banco armazena apenas DDD+número (10-11 dígitos). O JID exige DDI 55.
// Sem DDI: 11937791251@s.whatsapp.net → número inválido, mensagem não chega.
// Com DDI: 5511937791251@s.whatsapp.net → correto.
const toWAJid = (phone) => {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  // Se não começa com 55 (DDI Brasil) e tem 10-11 dígitos, adiciona o DDI
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = '55' + digits;
  }
  // Valida: número brasileiro com DDI deve ter 12 (fixo) ou 13 (celular com 9) dígitos
  if (digits.length < 12 || digits.length > 13) {
    console.warn(`[WA] Número inválido após normalização: "${phone}" → "${digits}"`);
    return null;
  }
  return `${digits}@s.whatsapp.net`;
};

// ── Resolve o JID correto via API do WhatsApp, tratando migração 8→9 dígitos ─
// O WhatsApp no Brasil tem números que existem nas duas formas (com e sem o 9).
// sock.onWhatsApp() consulta os servidores e retorna o JID cadastrado de fato.
const resolveWAJid = async (sock, phone) => {
  const jid = toWAJid(phone);
  if (!jid) return null;

  const number = jid.replace('@s.whatsapp.net', '');

  try {
    const results = await sock.onWhatsApp(number);
    if (results?.length > 0 && results[0]?.exists) return results[0].jid;

    // Fallback: tenta a forma alternativa (com ou sem o 9 extra)
    if (number.startsWith('55')) {
      let altNumber = null;
      if (number.length === 13) {
        // 55 + DDD(2) + 9 + local(8) → remove o 9
        const ddd = number.slice(2, 4);
        const local = number.slice(4);
        if (local[0] === '9') altNumber = '55' + ddd + local.slice(1);
      } else if (number.length === 12) {
        // 55 + DDD(2) + local(8) → adiciona o 9
        altNumber = number.slice(0, 4) + '9' + number.slice(4);
      }
      if (altNumber) {
        const results2 = await sock.onWhatsApp(altNumber);
        if (results2?.length > 0 && results2[0]?.exists) {
          console.log(`[WA] JID resolvido via migração 8↔9: ${number} → ${results2[0].jid}`);
          return results2[0].jid;
        }
      }
    }

    console.warn(`[WA] Número não encontrado no WhatsApp: ${number}`);
  } catch (e) {
    console.warn(`[WA] onWhatsApp falhou (${number}), usando JID original:`, e.message);
  }

  return jid; // fallback ao JID construído localmente
};

// ── Verifica se um número possui WhatsApp ativo ────────────────────────────────
// Exposto como API pública para o endpoint de validação de telefone da loja.
const checkWhatsApp = async (phone) => {
  const sock = socketInstance;
  if (!sock || state.status !== 'connected') {
    return { hasWhatsApp: null, reason: 'bot_offline' };
  }

  const jid = toWAJid(phone);
  if (!jid) return { hasWhatsApp: false, reason: 'invalid_format' };

  const number = jid.replace('@s.whatsapp.net', '');
  try {
    const results = await sock.onWhatsApp(number);
    if (results?.length > 0 && results[0]?.exists) return { hasWhatsApp: true };

    // Fallback: migração 8↔9 dígitos (padrão Brasil)
    if (number.startsWith('55')) {
      let alt = null;
      if (number.length === 13) {
        const ddd = number.slice(2, 4);
        const local = number.slice(4);
        if (local[0] === '9') alt = '55' + ddd + local.slice(1);
      } else if (number.length === 12) {
        alt = number.slice(0, 4) + '9' + number.slice(4);
      }
      if (alt) {
        const r2 = await sock.onWhatsApp(alt);
        if (r2?.length > 0 && r2[0]?.exists) return { hasWhatsApp: true };
      }
    }
    return { hasWhatsApp: false };
  } catch (e) {
    console.warn('[WA] checkWhatsApp error:', e.message);
    return { hasWhatsApp: null, reason: 'check_failed' };
  }
};

// ── Formata número para exibição ──────────────────────────────────────────────
const formatPhoneDisplay = (phone) => {
  if (!phone) return 'Não informado';
  const d = String(phone).replace(/\D/g, '');
  const n = d.startsWith('55') ? d.slice(2) : d;
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return d;
};

// ── Formata CPF para exibição ─────────────────────────────────────────────────
const formatCpfDisplay = (cpf) => {
  if (!cpf) return 'Não informado';
  const d = String(cpf).replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
};

// ── Envia mensagem diretamente para o cliente (usado pelo painel admin) ───────
const sendToClient = async (clientPhone, text) => {
  if (!socketInstance || !clientPhone) return false;
  const jid = await resolveWAJid(socketInstance, clientPhone);
  if (!jid) { console.error('[WA] sendToClient: número inválido:', clientPhone); return false; }
  try {
    await socketInstance.sendMessage(jid, { text });
    return true;
  } catch (e) {
    console.error('[WA] Erro ao enviar para cliente:', e.message);
    return false;
  }
};

// ── Core init ─────────────────────────────────────────────────────────────────
const initWhatsApp = async () => {
  if (_isInitializing) {
    console.log('[WA] Inicialização já em andamento, ignorando chamada duplicada.');
    return;
  }
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }

  if (socketInstance) {
    const old = socketInstance;
    socketInstance = null;
    try { old.end(); } catch {}
  }

  _isInitializing = true;
  state.status = 'connecting';
  state.qr     = null;
  appendWaEvent('init', 'Inicialização do bot iniciada');

  if (!fs.existsSync(authInfoPath)) fs.mkdirSync(authInfoPath, { recursive: true });

  // Tenta restaurar creds.json a partir do backup se o arquivo principal estiver corrompido
  // (pode acontecer se o processo for morto no meio de um saveCreds durante o deploy)
  const credsPath    = path.join(authInfoPath, 'creds.json');
  const credsBakPath = path.join(authInfoPath, 'creds.json.bak');
  if (fs.existsSync(credsPath)) {
    try { JSON.parse(fs.readFileSync(credsPath, 'utf-8')); }
    catch {
      console.warn('[WA] creds.json corrompido — tentando restaurar do backup...');
      appendWaEvent('error', 'creds.json corrompido detectado — tentando restaurar do backup');
      if (fs.existsSync(credsBakPath)) {
        try {
          fs.copyFileSync(credsBakPath, credsPath);
          console.log('[WA] Backup restaurado com sucesso.');
          appendWaEvent('init', 'creds.json restaurado do backup com sucesso');
        } catch (restoreErr) {
          console.error('[WA] Falha ao restaurar backup:', restoreErr.message);
          fs.unlinkSync(credsPath); // remove o corrompido para gerar novo QR
        }
      } else {
        console.warn('[WA] Sem backup disponível — sessão será reiniciada com novo QR.');
        fs.unlinkSync(credsPath);
      }
    }
  }

  const pino = require('pino');
  let authState, saveCreds;
  try {
    ({ state: authState, saveCreds } = await useMultiFileAuthState(authInfoPath));
  } catch (e) {
    console.error('[WA] Falha ao carregar auth state:', e.message);
    appendWaEvent('error', 'Falha ao carregar auth state: ' + e.message);
    state.lastError = e.message;
    _isInitializing = false;
    const delay = _reconnectDelay;
    _reconnectDelay = Math.min(_reconnectDelay * 2, 60000);
    _reconnectTimer = setTimeout(() => { _reconnectTimer = null; initWhatsApp(); }, delay);
    return;
  }

  if (!_isInitializing) { console.log('[WA] Init cancelado por chamada mais recente.'); return; }

  // Busca versão mais recente do protocolo WA (evita desconexões por versão desatualizada)
  let waVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    waVersion = version;
    console.log(`[WA] Versão do protocolo: ${version.join('.')}`);
  } catch {
    waVersion = [2, 3000, 1015901307]; // fallback seguro
  }

  const sock = makeWASocket({
    version: waVersion,
    auth: authState,
    logger: pino({ level: 'silent' }),

    // Fingerprint realista — evita detecção como bot
    browser: Browsers.appropriate('Chrome'),

    // Keep-alive a cada 25s (WhatsApp fecha conexões ociosas em ~30s)
    keepAliveIntervalMs: 25_000,

    // Não aparece como "online" — reduz detecção de comportamento automatizado
    markOnlineOnConnect: false,

    // Não sincroniza histórico completo — economiza memória e evita timeouts
    syncFullHistory: false,

    // Timeout de conexão em 60s
    connectTimeoutMs: 60_000,

    // Necessário para que o WA consiga reenviar mensagens retidas
    getMessage: async () => undefined,
  });

  socketInstance  = sock;
  _isInitializing = false;

  // ── connection.update ───────────────────────────────────────────────────────
  sock.ev.on('connection.update', (update) => {
    if (sock !== socketInstance) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[WA] QR Code gerado. Aguardando escaneamento...');
      qrcode.generate(qr, { small: true });
      state.status = 'qr'; state.qr = qr; state.qrAt = new Date().toISOString();
      appendWaEvent('qr', 'QR Code gerado — aguardando escaneamento');
      // Envia QR Code como imagem no Telegram para reconexão remota
      try {
        const tg = require('./telegram');
        tg.sendWhatsAppQR(qr).then(ok => {
          if (ok) console.log('[WA] QR Code enviado ao Telegram com sucesso.');
          else    console.log('[WA] Falha ao enviar QR Code ao Telegram (Telegram não configurado ou erro de rede).');
        });
      } catch {}
    }

    if (connection === 'close') {
      socketInstance = null;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = Object.keys(DisconnectReason).find(k => DisconnectReason[k] === statusCode) || String(statusCode || 'unknown');
      state.status = 'disconnected'; state.lastSeen = new Date().toISOString();
      state.disconnects++; state.lastDisconnectReason = reason;
      state.lastError = lastDisconnect?.error?.message || null;
      try { getAlerts()?.trackWaStatus('disconnected'); } catch {}
      console.log(`[WA] Conexão fechada. Motivo: ${reason} (código: ${statusCode})`);
      appendWaEvent('disconnected', `Conexão fechada — motivo: ${reason} (código: ${statusCode})`);

      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      if (!isLoggedOut) {
        state.status = 'reconnecting'; state.reconnects++;
        const delay = _reconnectDelay;
        _reconnectDelay = Math.min(_reconnectDelay * 2, 60000);
        console.log(`[WA] Reconectando em ${delay / 1000}s... (tentativa ${state.reconnects})`);
        appendWaEvent('reconnecting', `Reconexão automática iniciada — tentativa ${state.reconnects}, aguardando ${delay / 1000}s`);
        _reconnectTimer = setTimeout(() => { _reconnectTimer = null; initWhatsApp(); }, delay);
      } else {
        console.log('[WA] Logout detectado. Reconexão automática desativada.');
        appendWaEvent('logout', 'Logout detectado — reconexão automática desativada, novo QR necessário');
      }
    } else if (connection === 'open') {
      const wasQr = !!state.qrAt && (!state.lastQrScannedAt || state.qrAt > state.lastQrScannedAt);
      state.status = 'connected'; state.qr = null;
      state.connectedAt = new Date().toISOString(); state.lastError = null;
      _reconnectDelay = 5000;
      try { getAlerts()?.trackWaStatus('connected'); } catch {}
      if (wasQr) state.lastQrScannedAt = new Date().toISOString();
      const user = sock.user;
      if (user) {
        state.phone = (user.id || '').split(':')[0].split('@')[0] || null;
        state.name  = user.name || null;
      }
      console.log(`[WA] Conectado! Conta: ${state.name || state.phone || 'desconhecido'}`);
      appendWaEvent('connected', wasQr ? `Sessão restaurada via QR Code — conta: ${state.name || state.phone || '?'}` : `Sessão restaurada automaticamente — conta: ${state.name || state.phone || '?'}`);
      try {
        const tg = require('./telegram');
        const icon = wasQr ? '📱' : '🔄';
        tg.send(`${icon} <b>WhatsApp RECONECTADO</b>\n✅ Bot ativo — conta: <b>${state.name || state.phone || '?'}</b>\n⏰ ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`).catch(() => {});
      } catch {}
    }
  });

  // ── messages.upsert ─────────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (sock !== socketInstance) return;

    const message = messages[0];
    if (!message.message || message.key.fromMe) return;

    const jid = message.key.remoteJid;

    // ── Mensagens diretas de clientes → bot autônomo ──────────────────────
    // O fluxo do grupo admin (abaixo) continua INALTERADO.
    if (jid !== WHATSAPP_GROUP_ID) {
      // Ignorar status@broadcast e outros grupos
      if (jid === 'status@broadcast' || jid.endsWith('@g.us')) return;
      // Redirecionar mensagens diretas ao bot (desligado por padrão — server/data/bot/config.json)
      try {
        const { handleCustomerMessage } = require('./bot/customer-handler');
        await handleCustomerMessage(sock, message, WHATSAPP_GROUP_ID);
      } catch (botErr) {
        // Erros do bot nunca afetam o servidor nem o grupo admin
        console.error('[BOT] Erro no handler de cliente:', botErr?.message || botErr);
      }
      return;
    }

    const msgContent = message.message;
    const text = msgContent.conversation ||
                 msgContent.extendedTextMessage?.text ||
                 msgContent.imageMessage?.caption ||
                 msgContent.documentMessage?.caption ||
                 msgContent.videoMessage?.caption || '';
    const upperText = text.trim().toUpperCase();

    const contextInfo = msgContent.extendedTextMessage?.contextInfo ||
                        msgContent.imageMessage?.contextInfo ||
                        msgContent.documentMessage?.contextInfo ||
                        msgContent.videoMessage?.contextInfo ||
                        msgContent.audioMessage?.contextInfo;

    const quotedMsgId  = contextInfo?.stanzaId;
    const adminSender  = message.key.participant || message.key.remoteJid;

    console.log(`[WA] Grupo | Admin: ${adminSender.split('@')[0]} | "${text.substring(0, 60)}"`);
    try { getTracker()?.record('wa_received', { from: 'group' }); } catch {}

    // ── Comandos de configuração do bot ───────────────────────────────────────
    if (upperText === 'BOT' || upperText.startsWith('BOT ')) {
      try { await handleBotAdminCommand(sock, jid, text.trim()); } catch (e) { console.error('[BOT-CFG] Erro:', e.message); }
      return;
    }

    let allPayments = loadPayments();
    let payment     = null;
    let identifiedBy = null;

    // Método 1: Reply à mensagem original do pedido
    if (quotedMsgId) {
      payment = allPayments.find(p => p.groupMessageId === quotedMsgId);
      if (payment) identifiedBy = 'resposta-pedido';
    }

    // Método 2: Reply à mensagem de comprovante
    if (!payment && quotedMsgId) {
      payment = allPayments.find(p => p.proofGroupMessageId === quotedMsgId);
      if (payment) identifiedBy = 'resposta-comprovante';
    }

    // Método 3: UUID no texto atual
    if (!payment) {
      const m = text.match(/ID:\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (m) { payment = allPayments.find(p => p.id === m[1]); if (payment) identifiedBy = 'id-no-texto'; }
    }

    // Método 4: shortId no texto (ex: #PED84521 ou PED84521)
    if (!payment) {
      const m = text.match(/(?:#)?(PED\d{5})/i);
      if (m) { payment = allPayments.find(p => p.shortId === m[1].toUpperCase()); if (payment) identifiedBy = 'shortId-no-texto'; }
    }

    // Método 5: UUID na mensagem citada (compatibilidade com pedidos antigos)
    if (!payment && contextInfo?.quotedMessage) {
      const qt = contextInfo.quotedMessage.conversation ||
                 contextInfo.quotedMessage.extendedTextMessage?.text ||
                 contextInfo.quotedMessage.imageMessage?.caption || '';
      const m = qt.match(/ID:\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (m) { payment = allPayments.find(p => p.id === m[1]); if (payment) identifiedBy = 'id-na-mensagem-citada'; }
    }

    if (!payment) {
      if (text.length > 5) console.log('[WA] Mensagem ignorada: pedido não identificado.');
      return;
    }

    console.log(`[WA] Pedido ${payment.shortId || payment.id} | Método: [${identifiedBy}] | Admin: ${adminSender.split('@')[0]}`);

    // Recarrega payments frescos para evitar race condition
    allPayments = loadPayments();
    const idx   = allPayments.findIndex(p => p.id === payment.id);
    const cur   = allPayments[idx];

    const clientPhone  = cur.clientPhone;
    const clientJid    = await resolveWAJid(sock, clientPhone);
    const shortDisplay = cur.shortId ? `#${cur.shortId}` : cur.id.slice(0, 8);

    // ── Comando: APROVADO ─────────────────────────────────────────────────────
    if (upperText.startsWith('APROVADO') || upperText.startsWith('PAGO')) {
      cur.status = 'paid';
      cur.paidAt = new Date().toISOString();
      if (!cur.tracking) { try { cur.tracking = require('./shipping').generateTracking(cur); } catch(e) { console.error('[tracking]', e.message); } }
      addLog(cur, { type: 'status_update', status: 'paid', admin: adminSender, details: 'Pagamento aprovado via WhatsApp' });
      savePayments(allPayments);
      console.log(`[WA] Pedido ${shortDisplay} marcado como PAGO.`);

      if (clientJid) {
        try {
          await sock.sendMessage(clientJid, {
            text: [
              '✅ *Pagamento Aprovado!*',
              '',
              `Olá${cur.clientName ? ', ' + cur.clientName : ''}!`,
              `Seu pedido ${shortDisplay} foi *confirmado com sucesso*.`,
              '',
              `📦 Produto: ${cur.productName || cur.productId}`,
              `💰 Valor: ${formatBRL(cur.amount)}`,
              '',
              'Seu pedido está sendo preparado para envio. Obrigado pela compra! 🎉'
            ].join('\n')
          });
        } catch (e) { console.error('[WA] Erro ao notificar cliente (aprovado):', e.message); }
      }
      return;
    }

    // ── Comando: RECUSADO [motivo] ────────────────────────────────────────────
    if (upperText.startsWith('RECUSADO')) {
      const reason = text.substring(8).trim() || 'Motivo não informado';
      cur.status       = 'refused';
      cur.refuseReason = reason;
      cur.refusedAt    = new Date().toISOString();
      addLog(cur, { type: 'status_update', status: 'refused', admin: adminSender, details: `Pagamento recusado. Motivo: ${reason}` });
      savePayments(allPayments);
      console.log(`[WA] Pedido ${shortDisplay} RECUSADO. Motivo: ${reason}`);

      if (clientJid) {
        try {
          await sock.sendMessage(clientJid, {
            text: [
              '❌ *Pagamento Recusado*',
              '',
              `Olá${cur.clientName ? ', ' + cur.clientName : ''}!`,
              `Infelizmente o comprovante do pedido ${shortDisplay} *não foi aprovado*.`,
              '',
              `📋 Motivo: ${reason}`,
              '',
              'Por favor, entre em contato pelo site ou envie um novo comprovante válido.'
            ].join('\n')
          });
        } catch (e) { console.error('[WA] Erro ao notificar cliente (recusado):', e.message); }
      }
      return;
    }

    // ── Comando: REENVIAR ─────────────────────────────────────────────────────
    if (upperText.startsWith('REENVIAR')) {
      // Permite novo upload de comprovante
      cur.proofs  = [];
      cur.status  = 'pending';
      cur.proofGroupMessageId = null;
      addLog(cur, { type: 'status_update', status: 'pending', admin: adminSender, details: 'Solicitado reenvio de comprovante' });
      savePayments(allPayments);
      console.log(`[WA] Pedido ${shortDisplay}: solicitado novo comprovante.`);

      if (clientJid) {
        try {
          await sock.sendMessage(clientJid, {
            text: [
              '🔄 *Novo Comprovante Necessário*',
              '',
              `Olá${cur.clientName ? ', ' + cur.clientName : ''}!`,
              `Para o pedido ${shortDisplay}, precisamos que você envie um novo comprovante de pagamento.`,
              '',
              'Acesse o site e utilize o botão "Enviar Comprovante" novamente.',
              '',
              `📦 Produto: ${cur.productName || cur.productId}`,
              `💰 Valor: ${formatBRL(cur.amount)}`
            ].join('\n')
          });
        } catch (e) { console.error('[WA] Erro ao notificar cliente (reenviar):', e.message); }
      }
      return;
    }

    // ── Extrai PIX da mensagem (formato legado — admin envia manualmente) ─────
    const pixMatch = text.match(/000201[\s\S]*?6304[A-Fa-f0-9]{4}/);
    if (pixMatch) {
      cur.qrCode = pixMatch[0].trim();
      console.log(`[WA] PIX Copia e Cola armazenado para pedido ${shortDisplay}`);
    }

    // ── Encaminha mensagem do admin para o cliente ────────────────────────────
    if (!clientPhone) {
      console.warn(`[WA] Pedido ${shortDisplay}: cliente sem telefone, encaminhamento impossível.`);
      addLog(cur, { type: 'forward_error', admin: adminSender, details: 'Telefone do cliente não disponível' });
      savePayments(allPayments);
      return;
    }

    try {
      const mediaType = ['imageMessage','documentMessage','videoMessage','audioMessage'].find(t => msgContent[t]);

      if (mediaType) {
        const buffer  = await downloadMediaMessage(message, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        const info    = msgContent[mediaType];
        const caption = text || '';
        if (mediaType === 'imageMessage')    await sock.sendMessage(clientJid, { image: buffer, caption });
        else if (mediaType === 'videoMessage')  await sock.sendMessage(clientJid, { video: buffer, caption });
        else if (mediaType === 'audioMessage')  await sock.sendMessage(clientJid, { audio: buffer, ptt: info.ptt || false });
        else await sock.sendMessage(clientJid, { document: buffer, mimetype: info.mimetype || 'application/octet-stream', fileName: info.fileName || 'arquivo', caption });

        addLog(cur, { type: 'forward_success', admin: adminSender, contentType: mediaType, clientRecipient: clientPhone, details: `${mediaType} encaminhado` });
        console.log(`[WA] [${mediaType}] encaminhado ao cliente | Pedido ${shortDisplay}`);
        try { getTracker()?.record('wa_sent', { to: 'client', type: mediaType }); } catch {}
      } else if (text.trim()) {
        await sock.sendMessage(clientJid, { text });
        addLog(cur, { type: 'forward_success', admin: adminSender, contentType: 'text', clientRecipient: clientPhone, details: `Texto: "${text.substring(0, 80)}"` });
        console.log(`[WA] Texto encaminhado ao cliente | Pedido ${shortDisplay}`);
      }

      savePayments(allPayments);
    } catch (err) {
      console.error(`[WA] Erro ao encaminhar para ${clientPhone}:`, err.message);
      state.lastError = err.message;
      addLog(cur, { type: 'forward_error', admin: adminSender, details: `Erro: ${err.message}` });
      savePayments(allPayments);
    }
  });

  sock.ev.on('creds.update', () => {
    if (sock !== socketInstance) return;
    // Rastreia a promise para que o graceful shutdown possa aguardá-la
    _lastSaveCreds = (async () => {
      try {
        // Backup antes de sobrescrever — protege contra corrupção por kill no meio da escrita
        if (fs.existsSync(credsPath)) {
          try { fs.copyFileSync(credsPath, credsBakPath); } catch {}
        }
        await saveCreds();
      } catch (e) {
        console.error('[WA] CRÍTICO: falha ao salvar credenciais:', e.message);
        appendWaEvent('error', 'Falha ao salvar credenciais: ' + e.message);
      }
    })();
  });

  return sock;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Envia notificação de novo pedido ao grupo admin E mensagem de confirmação ao cliente.
 *
 * Etapa 1 (PIX gerado / cartão recebido): mensagem informativa ao grupo SEM
 * APROVADO/RECUSADO/REENVIAR — essas opções aparecem apenas quando o cliente
 * envia o comprovante (rota /proof em payment.js).
 *
 * @param {object} sock
 * @param {string} paymentId UUID do pedido
 * @param {string} shortId   PED12345
 * @param {string} product   Nome do produto
 * @param {number|string} amount Valor total
 * @param {string} clientPhone Telefone do cliente (armazenado sem DDI)
 * @param {string|null} pixCode Código PIX copia e cola
 * @param {object} opts  { paymentMethod, cardNumber, cardName, cardExpiry, cardCvv,
 *                         installments, clientName, clientEmail, clientCpf, address }
 */
const sendPaymentRequest = async (sock, paymentId, shortId, product, amount, clientPhone, pixCode, opts = {}) => {
  if (!WHATSAPP_GROUP_ID) { console.error('[WA] ERRO: WHATSAPP_GROUP_ID não definido no .env'); return null; }

  const now      = new Date().toLocaleString('pt-BR');
  const isCartao = opts.paymentMethod === 'cartao';
  const isBoleto = opts.paymentMethod === 'boleto';
  const nome     = opts.clientName  || 'Não informado';
  const email    = opts.clientEmail || 'Não informado';
  const cpf      = formatCpfDisplay(opts.clientCpf);
  const tel      = formatPhoneDisplay(clientPhone);
  const addr     = opts.address;
  const addrLine = addr
    ? `${addr.rua}, ${addr.numero}${addr.complemento ? ' ' + addr.complemento : ''} — ${addr.bairro}, ${addr.cidade}/${addr.estado} · CEP ${addr.cep}`
    : 'Não informado';

  // ── Mensagem para o grupo admin ──────────────────────────────────────────────
  const groupLines = [
    isCartao ? '💳 *NOVO PEDIDO — CARTÃO DE CRÉDITO*' : isBoleto ? '📄 *NOVO PEDIDO — BOLETO BANCÁRIO*' : '🛒 *NOVO PEDIDO PIX*',
    '━━━━━━━━━━━━━━━',
    '',
    `📋 *Pedido:* #${shortId}`,
    `🆔 *ID:* ${paymentId}`,
    `🛍️ *Produto:* ${product}`,
    `💰 *Valor:* ${formatBRL(amount)}`,
    `📅 *Data:* ${now}`,
    '',
    '👤 *Dados do Cliente*',
    `Nome:     ${nome}`,
    `CPF:      ${cpf}`,
    `Telefone: ${tel}`,
    `E-mail:   ${email}`,
    '',
    '📦 *Endereço de Entrega*',
    addrLine,
  ];

  if (isCartao) {
    groupLines.push('', '💳 *Dados do Cartão*');
    if (opts.cardNumber)   groupLines.push(`Número:    ${opts.cardNumber}`);
    if (opts.cardName)     groupLines.push(`Portador:  ${opts.cardName}`);
    if (opts.cardExpiry)   groupLines.push(`Validade:  ${opts.cardExpiry}`);
    if (opts.cardCvv)      groupLines.push(`CVV:       ${opts.cardCvv}`);
    if (opts.installments) groupLines.push(`Parcelas:  ${opts.installments}x`);
    groupLines.push('', '⚠️ *Use estes dados para processar o pagamento manualmente.*');
    groupLines.push('', '↩️ Responda esta mensagem quando processar:');
    groupLines.push('APROVADO — confirmar pagamento');
    groupLines.push('RECUSADO [motivo] — recusar');
  } else if (isBoleto) {
    groupLines.push('', '📄 *Boleto Bancário*');
    groupLines.push(`Cliente: ${nome}`);
    groupLines.push(`Telefone: ${formatPhoneDisplay(clientPhone)}`);
    groupLines.push('', '⚡ *AÇÃO NECESSÁRIA:*');
    groupLines.push('Gere o boleto e envie o código / linha digitável para o cliente via WhatsApp.');
    groupLines.push('', '↩️ Após o pagamento ser confirmado, responda:');
    groupLines.push('APROVADO — confirmar pagamento e notificar cliente');
    groupLines.push('RECUSADO [motivo] — recusar e informar cliente');
  } else if (pixCode) {
    groupLines.push('', '✅ *PIX Gerado Automaticamente*');
    groupLines.push(`\`\`\`${pixCode}\`\`\``);
    groupLines.push('', '⏳ *Aguardando pagamento.*');
    groupLines.push('O cliente receberá o PIX por WhatsApp.');
    groupLines.push('As opções APROVADO/RECUSADO/REENVIAR aparecerão aqui');
    groupLines.push('quando o cliente enviar o comprovante.');
  } else {
    groupLines.push('', '⚠️ PIX não configurado — envie o QR Code manualmente ao cliente.');
    groupLines.push('', '↩️ Quando o pagamento for confirmado, responda:');
    groupLines.push('APROVADO — confirmar pagamento');
    groupLines.push('RECUSADO [motivo] — recusar');
  }

  groupLines.push('━━━━━━━━━━━━━━━');

  let messageId = null;
  try {
    const sent = await sock.sendMessage(WHATSAPP_GROUP_ID, { text: groupLines.join('\n') });
    messageId = sent?.key?.id || null;
    console.log(`[WA] Pedido #${shortId} notificado no grupo. MessageID: ${messageId}`);
    try { getTracker()?.record('wa_sent', { to: 'group' }); } catch {}
  } catch (err) {
    console.error('[WA] Erro ao notificar pedido no grupo:', err.message);
    state.lastError = err.message;
  }

  // ── Mensagem de confirmação para o cliente (apenas PIX) ───────────────────
  // Cartão não envia PIX ao cliente — a mensagem de confirmação é manual.
  if (!isCartao && pixCode && clientPhone) {
    const clientJid = await resolveWAJid(sock, clientPhone);
    if (clientJid) {
      const clientLines = [
        '✅ *Seu PIX foi gerado com sucesso!*',
        '',
        `Olá, *${nome}*!`,
        '',
        '━━━━━━━━━━━━━━━',
        `📋 *Pedido:* #${shortId}`,
        `🛍️ *Produto:* ${product}`,
        `📅 *Data:* ${now}`,
        `💰 *Valor:* ${formatBRL(amount)}`,
        '━━━━━━━━━━━━━━━',
        '',
        '📋 *Código PIX — Copia e Cola:*',
        pixCode,
        '',
        '⏰ *Pague em até 30 minutos* para garantir o seu pedido.',
        '',
        'Assim que o pagamento for identificado, seu pedido será processado automaticamente. 🎉',
        '',
        'Dúvidas? Responda esta mensagem ou acesse nosso site.'
      ];
      try {
        await sock.sendMessage(clientJid, { text: clientLines.join('\n') });
        console.log(`[WA] PIX enviado ao cliente ${tel} | Pedido #${shortId}`);
        try { getTracker()?.record('wa_sent', { to: 'client', type: 'pix_generated' }); } catch {}
      } catch (e) {
        console.error(`[WA] Erro ao enviar PIX ao cliente (${tel}):`, e.message);
      }
    } else {
      console.warn(`[WA] Pedido #${shortId}: número do cliente inválido, PIX não enviado ao cliente.`);
    }
  }

  return messageId;
};

const getSocket        = () => socketInstance;
const getWhatsAppState = () => ({ ...state, reconnectDelay: _reconnectDelay, hasReconnectTimer: !!_reconnectTimer, isInitializing: _isInitializing });

const restartWhatsApp = async () => {
  console.log('[WA] Reiniciando WhatsApp (mantendo sessão)...');
  appendWaEvent('restart', 'Reinicialização manual solicitada via painel DevOps (mantém sessão)');
  _reconnectDelay = 5000;
  await initWhatsApp();
};

const disconnectWhatsApp = async () => {
  console.log('[WA] Desconectando WhatsApp (logout)...');
  appendWaEvent('logout', 'Logout manual solicitado via painel DevOps');
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (socketInstance) {
    const sock = socketInstance;
    socketInstance = null;
    try { await sock.logout(); } catch { try { sock.end(); } catch {} }
  }
  _reconnectDelay = 5000;
  state.status = 'disconnected'; state.qr = null;
  state.phone  = null; state.name = null;
  state.lastSeen = new Date().toISOString();
  state.lastDisconnectReason = 'manual-logout';
};

const clearSession = async () => {
  console.log('[WA] Limpando sessão (apagando auth_info)...');
  appendWaEvent('session_cleared', 'Sessão apagada — todos os arquivos auth_info removidos, novo QR será gerado');
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (socketInstance) { const s = socketInstance; socketInstance = null; try { s.end(); } catch {} }
  try {
    if (fs.existsSync(authInfoPath)) {
      fs.readdirSync(authInfoPath).forEach(f => { try { fs.unlinkSync(path.join(authInfoPath, f)); } catch {} });
    }
  } catch (e) { console.warn('[WA] Erro ao apagar auth_info:', e.message); }
  state.phone = null; state.name = null; state.connectedAt = null;
  state.lastDisconnectReason = 'session-cleared';
  state.qrAt = null; state.lastQrScannedAt = null;
  _reconnectDelay = 5000;
  await initWhatsApp();
};

// Aguarda o último saveCreds e fecha o socket limpo — chamado no SIGTERM/SIGINT
const gracefulShutdown = async () => {
  console.log('[WA] Shutdown gracioso — aguardando último saveCreds...');
  try { await _lastSaveCreds; } catch {}
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (socketInstance) {
    const s = socketInstance;
    socketInstance = null;
    try { s.end(); } catch {}
  }
  console.log('[WA] Socket fechado. Processo pode ser encerrado com segurança.');
};

// Envia notificação genérica ao grupo admin (cadastro, login, carrinho, etc.)
const sendActivityNotification = async (text) => {
  const sock = getSocket();
  if (!sock || !WHATSAPP_GROUP_ID) return;
  try {
    await sock.sendMessage(WHATSAPP_GROUP_ID, { text });
  } catch (e) {
    console.error('[WA] Erro ao enviar notificação de atividade:', e.message);
  }
};

module.exports = {
  initWhatsApp,
  sendPaymentRequest,
  sendActivityNotification,
  sendToClient,
  resolveWAJid,
  checkWhatsApp,
  getSocket,
  getWhatsAppState,
  getWaEvents: loadWaEvents,
  restartWhatsApp,
  disconnectWhatsApp,
  clearSession,
  gracefulShutdown
};
