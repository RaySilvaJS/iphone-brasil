const { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path   = require('path');
const fs     = require('fs');

const paymentsPath   = path.join(__dirname, 'data', 'payments.json');
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID;

const getTracker = () => { try { return require('./tracker'); } catch { return null; } };
const getAlerts  = () => { try { return require('./alerts');  } catch { return null; } };

const loadPayments = () => { try { return JSON.parse(fs.readFileSync(paymentsPath, 'utf-8')); } catch { return []; } };
const savePayments = (p) => fs.writeFileSync(paymentsPath, JSON.stringify(p, null, 2), 'utf-8');
const formatBRL    = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const addLog = (payment, entry) => {
  payment.logs = payment.logs || [];
  payment.logs.push({ ...entry, timestamp: new Date().toISOString() });
};

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

// ── Envia mensagem diretamente para o cliente (usado pelo painel admin) ───────
const sendToClient = async (clientPhone, text) => {
  if (!socketInstance || !clientPhone) return false;
  const jid = `${clientPhone.replace(/\D/g, '')}@s.whatsapp.net`;
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

  if (!fs.existsSync(authInfoPath)) fs.mkdirSync(authInfoPath, { recursive: true });

  const pino = require('pino');
  let authState, saveCreds;
  try {
    ({ state: authState, saveCreds } = await useMultiFileAuthState(authInfoPath));
  } catch (e) {
    console.error('[WA] Falha ao carregar auth state:', e.message);
    state.lastError = e.message;
    _isInitializing = false;
    const delay = _reconnectDelay;
    _reconnectDelay = Math.min(_reconnectDelay * 2, 60000);
    _reconnectTimer = setTimeout(() => { _reconnectTimer = null; initWhatsApp(); }, delay);
    return;
  }

  if (!_isInitializing) { console.log('[WA] Init cancelado por chamada mais recente.'); return; }

  const sock = makeWASocket({ auth: authState, logger: pino({ level: 'silent' }) });
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

      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      if (!isLoggedOut) {
        state.status = 'reconnecting'; state.reconnects++;
        const delay = _reconnectDelay;
        _reconnectDelay = Math.min(_reconnectDelay * 2, 60000);
        console.log(`[WA] Reconectando em ${delay / 1000}s... (tentativa ${state.reconnects})`);
        _reconnectTimer = setTimeout(() => { _reconnectTimer = null; initWhatsApp(); }, delay);
      } else {
        console.log('[WA] Logout detectado. Reconexão automática desativada.');
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
    }
  });

  // ── messages.upsert ─────────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (sock !== socketInstance) return;

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

    const clientPhone = cur.clientPhone;
    const clientJid   = clientPhone ? `${clientPhone.replace(/\D/g, '')}@s.whatsapp.net` : null;
    const shortDisplay = cur.shortId ? `#${cur.shortId}` : cur.id.slice(0, 8);

    // ── Comando: APROVADO ─────────────────────────────────────────────────────
    if (upperText.startsWith('APROVADO') || upperText.startsWith('PAGO')) {
      cur.status = 'paid';
      cur.paidAt = new Date().toISOString();
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

  sock.ev.on('creds.update', async () => {
    if (sock !== socketInstance) return;
    await saveCreds();
  });

  return sock;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Envia notificação de novo pedido ao grupo com o código PIX incluído.
 * @param {object} sock
 * @param {string} paymentId UUID
 * @param {string} shortId   PED12345
 * @param {string} product   Nome do produto
 * @param {number|string} amount Valor
 * @param {string} clientPhone Telefone do cliente
 * @param {string|null} pixCode Código PIX gerado (se disponível)
 */
const sendPaymentRequest = async (sock, paymentId, shortId, product, amount, clientPhone, pixCode, opts = {}) => {
  if (!WHATSAPP_GROUP_ID) { console.error('[WA] ERRO: WHATSAPP_GROUP_ID não definido no .env'); return null; }

  const now   = new Date().toLocaleString('pt-BR');
  const phone = clientPhone ? clientPhone.replace(/\D/g, '') : 'Não informado';
  const isCartao = opts.paymentMethod === 'cartao';

  const lines = [
    isCartao ? '💳 *NOVO PEDIDO — CARTÃO DE CRÉDITO*' : '🛒 *NOVO PEDIDO*', '',
    `Pedido: #${shortId}`,
    `ID: ${paymentId}`,
    `Produto: ${product}`,
    `Valor: ${formatBRL(amount)}`,
    `Telefone: ${phone}`,
    `Data: ${now}`
  ];

  if (isCartao) {
    lines.push('', '💳 *Dados do Cartão*');
    if (opts.cardNumber)   lines.push(`Número: ${opts.cardNumber}`);
    if (opts.cardName)     lines.push(`Portador: ${opts.cardName}`);
    if (opts.cardExpiry)   lines.push(`Validade: ${opts.cardExpiry}`);
    if (opts.cardCvv)      lines.push(`CVV: ${opts.cardCvv}`);
    if (opts.installments) lines.push(`Parcelas: ${opts.installments}x`);
    lines.push('', '⚠️ Use estes dados para processar o pagamento e confirme com o cliente.');
  } else if (pixCode) {
    lines.push('', '✅ *PIX Gerado Automaticamente*', pixCode);
  } else {
    lines.push('', '⚠️ PIX não configurado — envie o QR Code manualmente.');
  }

  lines.push('', '↩️ Responda esta mensagem:', 'APROVADO — confirmar pagamento', 'RECUSADO [motivo] — recusar', 'REENVIAR — pedir novo comprovante');

  const messageText = lines.join('\n');

  try {
    const sent      = await sock.sendMessage(WHATSAPP_GROUP_ID, { text: messageText });
    const messageId = sent?.key?.id || null;
    console.log(`[WA] Pedido #${shortId} notificado no grupo. MessageID: ${messageId}`);
    try { getTracker()?.record('wa_sent', { to: 'group' }); } catch {}
    return messageId;
  } catch (err) {
    console.error('[WA] Erro ao notificar pedido no grupo:', err.message);
    state.lastError = err.message;
    return null;
  }
};

const getSocket        = () => socketInstance;
const getWhatsAppState = () => ({ ...state, reconnectDelay: _reconnectDelay, hasReconnectTimer: !!_reconnectTimer, isInitializing: _isInitializing });

const restartWhatsApp = async () => {
  console.log('[WA] Reiniciando WhatsApp (mantendo sessão)...');
  _reconnectDelay = 5000;
  await initWhatsApp();
};

const disconnectWhatsApp = async () => {
  console.log('[WA] Desconectando WhatsApp (logout)...');
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

module.exports = {
  initWhatsApp,
  sendPaymentRequest,
  sendToClient,
  getSocket,
  getWhatsAppState,
  restartWhatsApp,
  disconnectWhatsApp,
  clearSession
};
