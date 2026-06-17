const { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const paymentsPath = path.join(__dirname, 'data', 'payments.json');
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID;
// Lazy require to avoid circular dependency during startup
const getTracker = () => { try { return require('./tracker'); } catch { return null; } };

const loadPayments = () => {
  try { return JSON.parse(fs.readFileSync(paymentsPath, 'utf-8')); } catch { return []; }
};
const savePayments = (p) => fs.writeFileSync(paymentsPath, JSON.stringify(p, null, 2), 'utf-8');

const formatBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const addLog = (payment, entry) => {
  payment.logs = payment.logs || [];
  payment.logs.push({ ...entry, timestamp: new Date().toISOString() });
};

// ── Persistent state ─────────────────────────────────────────────────────────
const state = {
  status: 'disconnected',
  qr: null,
  qrAt: null,
  lastQrScannedAt: null,
  phone: null,
  name: null,
  connectedAt: null,
  lastSeen: null,
  reconnects: 0,
  disconnects: 0,
  lastError: null,
  lastDisconnectReason: null,
  startedAt: new Date().toISOString()
};

// ── Reconnect control ─────────────────────────────────────────────────────────
// _reconnectTimer: holds the pending setTimeout so it can be cancelled
// _isInitializing: prevents two simultaneous initWhatsApp() calls
// _reconnectDelay: exponential backoff, resets to 5s on successful connection
let _reconnectTimer = null;
let _isInitializing = false;
let _reconnectDelay = 5000;

const authInfoPath = path.join(__dirname, 'auth_info');
let socketInstance = null;

// ── Core init ─────────────────────────────────────────────────────────────────
const initWhatsApp = async () => {
  // Prevent concurrent inits — only one socket at a time
  if (_isInitializing) {
    console.log('[WA] Inicialização já em andamento, ignorando chamada duplicada.');
    return;
  }

  // Cancel any pending automatic reconnect timer
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }

  // Close and nullify the current socket BEFORE creating a new one.
  // Setting socketInstance = null first prevents the old socket's close
  // event from scheduling yet another reconnect.
  if (socketInstance) {
    const old = socketInstance;
    socketInstance = null;
    try { old.end(); } catch {}
  }

  _isInitializing = true;
  state.status = 'connecting';
  state.qr = null;

  if (!fs.existsSync(authInfoPath)) fs.mkdirSync(authInfoPath, { recursive: true });

  const pino = require('pino');
  let authState, saveCreds;
  try {
    ({ state: authState, saveCreds } = await useMultiFileAuthState(authInfoPath));
  } catch (e) {
    console.error('[WA] Falha ao carregar auth state:', e.message);
    state.lastError = e.message;
    _isInitializing = false;
    // Retry after backoff
    const delay = _reconnectDelay;
    _reconnectDelay = Math.min(_reconnectDelay * 2, 60000);
    _reconnectTimer = setTimeout(() => { _reconnectTimer = null; initWhatsApp(); }, delay);
    return;
  }

  // If another init started while we were awaiting useMultiFileAuthState, abort
  if (!_isInitializing) {
    console.log('[WA] Init cancelado por chamada mais recente.');
    return;
  }

  const sock = makeWASocket({ auth: authState, logger: pino({ level: 'silent' }) });
  socketInstance = sock;
  _isInitializing = false;

  // ── connection.update ───────────────────────────────────────────────────────
  sock.ev.on('connection.update', (update) => {
    // Stale socket guard: if this socket was replaced, ignore its events
    if (sock !== socketInstance) return;

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[WA] QR Code gerado. Aguardando escaneamento...');
      qrcode.generate(qr, { small: true });
      state.status = 'qr';
      state.qr = qr;
      state.qrAt = new Date().toISOString();
    }

    if (connection === 'close') {
      // Nullify immediately so no further events from this socket trigger reconnects
      socketInstance = null;

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = Object.keys(DisconnectReason).find(k => DisconnectReason[k] === statusCode) || String(statusCode || 'unknown');

      state.status = 'disconnected';
      state.lastSeen = new Date().toISOString();
      state.disconnects++;
      state.lastDisconnectReason = reason;
      state.lastError = lastDisconnect?.error?.message || null;

      console.log(`[WA] Conexão fechada. Motivo: ${reason} (código: ${statusCode})`);

      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      if (!isLoggedOut) {
        state.status = 'reconnecting';
        state.reconnects++;
        const delay = _reconnectDelay;
        _reconnectDelay = Math.min(_reconnectDelay * 2, 60000);
        console.log(`[WA] Reconectando em ${delay / 1000}s... (tentativa ${state.reconnects})`);
        _reconnectTimer = setTimeout(() => { _reconnectTimer = null; initWhatsApp(); }, delay);
      } else {
        console.log('[WA] Logout detectado. Reconexão automática desativada.');
      }

    } else if (connection === 'open') {
      const wasQr = !!state.qrAt && !state.lastQrScannedAt || (state.qrAt > (state.lastQrScannedAt || ''));
      state.status = 'connected';
      state.qr = null;
      state.connectedAt = new Date().toISOString();
      state.lastError = null;
      _reconnectDelay = 5000; // reset backoff on successful connection

      if (wasQr) state.lastQrScannedAt = new Date().toISOString();

      const user = sock.user;
      if (user) {
        state.phone = (user.id || '').split(':')[0].split('@')[0] || null;
        state.name = user.name || null;
      }
      console.log(`[WA] Conectado com sucesso! Conta: ${state.name || state.phone || 'desconhecido'}`);
    }
  });

  // ── messages.upsert ─────────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (sock !== socketInstance) return; // stale socket

    const message = messages[0];
    if (!message.message || message.key.fromMe) return;

    const jid = message.key.remoteJid;
    if (jid !== WHATSAPP_GROUP_ID) return;

    const msgContent = message.message;
    const text = msgContent.conversation ||
                 msgContent.extendedTextMessage?.text ||
                 msgContent.imageMessage?.caption ||
                 msgContent.documentMessage?.caption ||
                 msgContent.videoMessage?.caption || '';
    const upperText = text.toUpperCase();

    const contextInfo = msgContent.extendedTextMessage?.contextInfo ||
                        msgContent.imageMessage?.contextInfo ||
                        msgContent.documentMessage?.contextInfo ||
                        msgContent.videoMessage?.contextInfo ||
                        msgContent.audioMessage?.contextInfo;

    const quotedMsgId = contextInfo?.stanzaId;
    const adminSender = message.key.participant || message.key.remoteJid;

    console.log(`[WA] Grupo | Admin: ${adminSender.split('@')[0]} | "${text.substring(0, 50)}"`);
    try { getTracker()?.record('wa_received', { from: 'group' }); } catch {}

    let allPayments = loadPayments();
    let payment = null;
    let identifiedBy = null;

    // Método 1: Resposta direta à mensagem original (stanzaId = groupMessageId)
    if (quotedMsgId) {
      payment = allPayments.find(p => p.groupMessageId === quotedMsgId);
      if (payment) identifiedBy = 'resposta-direta';
    }

    // Método 2: UUID no texto atual
    if (!payment) {
      const m = text.match(/ID:\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (m) { payment = allPayments.find(p => p.id === m[1]); if (payment) identifiedBy = 'id-no-texto'; }
    }

    // Método 3: UUID na mensagem citada (compatibilidade com pedidos antigos)
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

    console.log(`[WA] Pedido ${payment.id} | Método: [${identifiedBy}] | Admin: ${adminSender.split('@')[0]}`);

    allPayments = loadPayments();
    const idx = allPayments.findIndex(p => p.id === payment.id);
    const cur = allPayments[idx];

    if (upperText.startsWith('PAGO')) {
      cur.status = 'paid';
      addLog(cur, { type: 'status_update', status: 'paid', admin: adminSender, details: 'Pagamento confirmado via WhatsApp' });
      savePayments(allPayments);
      console.log(`[WA] Pedido ${payment.id} marcado como PAGO.`);
      return;
    }

    const pixMatch = text.match(/000201[\s\S]*?6304[A-Fa-f0-9]{4}/);
    if (pixMatch) {
      cur.qrCode = pixMatch[0].trim();
      console.log(`[WA] PIX Copia e Cola armazenado para pedido ${payment.id}`);
    }

    const clientPhone = cur.clientPhone;
    if (!clientPhone) {
      console.warn(`[WA] Pedido ${payment.id}: cliente sem telefone, encaminhamento impossível.`);
      addLog(cur, { type: 'forward_error', admin: adminSender, details: 'Telefone do cliente não disponível' });
      savePayments(allPayments);
      return;
    }

    const clientJid = `${clientPhone.replace(/\D/g, '')}@s.whatsapp.net`;

    try {
      const mediaType = ['imageMessage','documentMessage','videoMessage','audioMessage'].find(t => msgContent[t]);

      if (mediaType) {
        const buffer = await downloadMediaMessage(message, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        const info = msgContent[mediaType];
        const caption = text || '';
        if (mediaType === 'imageMessage') await sock.sendMessage(clientJid, { image: buffer, caption });
        else if (mediaType === 'videoMessage') await sock.sendMessage(clientJid, { video: buffer, caption });
        else if (mediaType === 'audioMessage') await sock.sendMessage(clientJid, { audio: buffer, ptt: info.ptt || false });
        else await sock.sendMessage(clientJid, { document: buffer, mimetype: info.mimetype || 'application/octet-stream', fileName: info.fileName || 'arquivo', caption });

        addLog(cur, { type: 'forward_success', admin: adminSender, contentType: mediaType, clientRecipient: clientPhone, details: `${mediaType} encaminhado para ${clientPhone}` });
        console.log(`[WA] [${mediaType}] encaminhado ao cliente ${clientPhone} | Pedido ${payment.id}`);
        try { getTracker()?.record('wa_sent', { to: 'client', type: mediaType }); } catch {}
      } else if (text.trim()) {
        await sock.sendMessage(clientJid, { text });
        addLog(cur, { type: 'forward_success', admin: adminSender, contentType: 'text', clientRecipient: clientPhone, details: `Texto: "${text.substring(0, 80)}"` });
        console.log(`[WA] Texto encaminhado ao cliente ${clientPhone} | Pedido ${payment.id}`);
      }

      savePayments(allPayments);
    } catch (err) {
      console.error(`[WA] Erro ao encaminhar para ${clientPhone}:`, err.message);
      state.lastError = err.message;
      addLog(cur, { type: 'forward_error', admin: adminSender, details: `Erro: ${err.message}` });
      savePayments(allPayments);
    }
  });

  sock.ev.on('creds.update', async () => {
    if (sock !== socketInstance) return;
    await saveCreds();
  });

  return sock;
};

// ── Public API ────────────────────────────────────────────────────────────────

const sendPaymentRequest = async (sock, paymentId, product, amount, clientPhone) => {
  if (!WHATSAPP_GROUP_ID) { console.error('[WA] ERRO: WHATSAPP_GROUP_ID não definido no .env'); return null; }

  const now = new Date().toLocaleString('pt-BR');
  const phone = clientPhone ? clientPhone.replace(/\D/g, '') : 'Não informado';
  const message = [
    '🛒 NOVO PEDIDO', '',
    `ID: ${paymentId}`,
    `Produto: ${product}`,
    `Valor: ${formatBRL(amount)}`,
    `Telefone: ${phone}`,
    `Data: ${now}`, '',
    '↩️ Responda ESTA mensagem com o PIX ou QR Code para enviar diretamente ao cliente.'
  ].join('\n');

  try {
    const sent = await sock.sendMessage(WHATSAPP_GROUP_ID, { text: message });
    const messageId = sent?.key?.id || null;
    console.log(`[WA] Pedido ${paymentId} notificado no grupo. MessageID: ${messageId}`);
    try { getTracker()?.record('wa_sent', { to: 'group' }); } catch {}
    return messageId;
  } catch (err) {
    console.error('[WA] Erro ao notificar pedido no grupo:', err.message);
    state.lastError = err.message;
    return null;
  }
};

const getSocket = () => socketInstance;

const getWhatsAppState = () => ({
  ...state,
  reconnectDelay: _reconnectDelay,
  hasReconnectTimer: !!_reconnectTimer,
  isInitializing: _isInitializing
});

// Reinicia sem apagar sessão (reconecta com as credenciais existentes)
const restartWhatsApp = async () => {
  console.log('[WA] Reiniciando WhatsApp (mantendo sessão)...');
  _reconnectDelay = 5000; // reset backoff for manual restart
  await initWhatsApp();
};

// Desconecta e faz logout — não reconecta automaticamente
const disconnectWhatsApp = async () => {
  console.log('[WA] Desconectando WhatsApp (logout)...');
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (socketInstance) {
    const sock = socketInstance;
    socketInstance = null; // prevent close handler from scheduling reconnect
    try { await sock.logout(); } catch { try { sock.end(); } catch {} }
  }
  _reconnectDelay = 5000;
  state.status = 'disconnected';
  state.qr = null;
  state.phone = null;
  state.name = null;
  state.lastSeen = new Date().toISOString();
  state.lastDisconnectReason = 'manual-logout';
};

// Apaga arquivos de autenticação e gera novo QR Code
const clearSession = async () => {
  console.log('[WA] Limpando sessão (apagando auth_info)...');
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (socketInstance) {
    const sock = socketInstance;
    socketInstance = null;
    try { sock.end(); } catch {}
  }
  try {
    if (fs.existsSync(authInfoPath)) {
      const files = fs.readdirSync(authInfoPath);
      files.forEach(f => { try { fs.unlinkSync(path.join(authInfoPath, f)); } catch {} });
    }
  } catch (e) { console.warn('[WA] Erro ao apagar auth_info:', e.message); }
  state.phone = null;
  state.name = null;
  state.connectedAt = null;
  state.lastDisconnectReason = 'session-cleared';
  state.qrAt = null;
  state.lastQrScannedAt = null;
  _reconnectDelay = 5000;
  await initWhatsApp();
};

module.exports = {
  initWhatsApp,
  sendPaymentRequest,
  getSocket,
  getWhatsAppState,
  restartWhatsApp,
  disconnectWhatsApp,
  clearSession
};
