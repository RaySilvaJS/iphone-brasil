const { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const paymentsPath = path.join(__dirname, 'data', 'payments.json');
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID;

const loadPayments = () => {
  try { return JSON.parse(fs.readFileSync(paymentsPath, 'utf-8')); } catch { return []; }
};
const savePayments = (p) => fs.writeFileSync(paymentsPath, JSON.stringify(p, null, 2), 'utf-8');

const formatBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const addLog = (payment, entry) => {
  payment.logs = payment.logs || [];
  payment.logs.push({ ...entry, timestamp: new Date().toISOString() });
};

// ---- State ----
const state = {
  status: 'disconnected', // disconnected | connecting | qr | connected | reconnecting
  qr: null,
  qrAt: null,
  phone: null,
  name: null,
  connectedAt: null,
  lastSeen: null,
  reconnects: 0
};

const authInfoPath = path.join(__dirname, 'auth_info');
let socketInstance = null;

const initWhatsApp = async () => {
  if (!fs.existsSync(authInfoPath)) fs.mkdirSync(authInfoPath, { recursive: true });

  state.status = 'connecting';
  state.qr = null;

  const pino = require('pino');
  const { state: authState, saveCreds } = await useMultiFileAuthState(authInfoPath);
  const sock = makeWASocket({ auth: authState, logger: pino({ level: 'silent' }) });
  socketInstance = sock;

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('>> Escaneie o QR Code abaixo com seu WhatsApp:');
      qrcode.generate(qr, { small: true });
      state.status = 'qr';
      state.qr = qr;
      state.qrAt = new Date().toISOString();
    }

    if (connection === 'close') {
      state.status = 'disconnected';
      state.lastSeen = new Date().toISOString();
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada. Reconectando:', shouldReconnect);
      if (shouldReconnect) {
        state.status = 'reconnecting';
        state.reconnects++;
        setTimeout(() => initWhatsApp(), 5000);
      }
    } else if (connection === 'open') {
      state.status = 'connected';
      state.qr = null;
      state.connectedAt = new Date().toISOString();
      const user = sock.user;
      if (user) {
        state.phone = (user.id || '').split(':')[0].split('@')[0] || null;
        state.name = user.name || null;
      }
      console.log('Conexão com WhatsApp estabelecida com sucesso!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
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

    console.log(`>> Grupo | Admin: ${adminSender.split('@')[0]} | "${text.substring(0, 50)}"`);

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
      if (text.length > 5) console.log(`>> Mensagem ignorada: pedido não identificado.`);
      return;
    }

    console.log(`>> Pedido ${payment.id} | Método: [${identifiedBy}] | Admin: ${adminSender.split('@')[0]}`);

    allPayments = loadPayments();
    const idx = allPayments.findIndex(p => p.id === payment.id);
    const cur = allPayments[idx];

    if (upperText.startsWith('PAGO')) {
      cur.status = 'paid';
      addLog(cur, { type: 'status_update', status: 'paid', admin: adminSender, details: 'Pagamento confirmado via WhatsApp' });
      savePayments(allPayments);
      console.log(`>> Pedido ${payment.id} marcado como PAGO.`);
      return;
    }

    const pixMatch = text.match(/000201[\s\S]*?6304[A-Fa-f0-9]{4}/);
    if (pixMatch) {
      cur.qrCode = pixMatch[0].trim();
      console.log(`>> PIX Copia e Cola armazenado para pedido ${payment.id}`);
    }

    const clientPhone = cur.clientPhone;
    if (!clientPhone) {
      console.warn(`>> Pedido ${payment.id}: cliente sem telefone, encaminhamento impossível.`);
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
        console.log(`>> [${mediaType}] encaminhado ao cliente ${clientPhone} | Pedido ${payment.id}`);
      } else if (text.trim()) {
        await sock.sendMessage(clientJid, { text });
        addLog(cur, { type: 'forward_success', admin: adminSender, contentType: 'text', clientRecipient: clientPhone, details: `Texto: "${text.substring(0, 80)}"` });
        console.log(`>> Texto encaminhado ao cliente ${clientPhone} | Pedido ${payment.id}`);
      }

      savePayments(allPayments);
    } catch (err) {
      console.error(`>> Erro ao encaminhar para ${clientPhone}:`, err.message);
      addLog(cur, { type: 'forward_error', admin: adminSender, details: `Erro: ${err.message}` });
      savePayments(allPayments);
    }
  });

  sock.ev.on('creds.update', async () => { await saveCreds(); });
  return sock;
};

const sendPaymentRequest = async (sock, paymentId, product, amount, clientPhone) => {
  if (!WHATSAPP_GROUP_ID) { console.error('ERRO: WHATSAPP_GROUP_ID não definido no .env'); return null; }

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
    console.log(`>> Pedido ${paymentId} notificado no grupo. MessageID: ${messageId}`);
    return messageId;
  } catch (err) {
    console.error('>> Erro ao notificar pedido no grupo:', err.message);
    return null;
  }
};

const getSocket = () => socketInstance;
const getWhatsAppState = () => ({ ...state });

const restartWhatsApp = async () => {
  console.log('>> Reiniciando WhatsApp...');
  if (socketInstance) { try { await socketInstance.end(); } catch {} }
  socketInstance = null;
  state.status = 'reconnecting';
  state.qr = null;
  await initWhatsApp();
};

const disconnectWhatsApp = async () => {
  console.log('>> Desconectando WhatsApp...');
  if (socketInstance) { try { await socketInstance.logout(); } catch { try { await socketInstance.end(); } catch {} } socketInstance = null; }
  state.status = 'disconnected';
  state.qr = null;
  state.phone = null;
  state.name = null;
  state.lastSeen = new Date().toISOString();
};

module.exports = { initWhatsApp, sendPaymentRequest, getSocket, getWhatsAppState, restartWhatsApp, disconnectWhatsApp };
