const { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const paymentsPath = path.join(__dirname, 'data', 'payments.json');
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID;

const loadPayments = () => {
  try {
    return JSON.parse(fs.readFileSync(paymentsPath, 'utf-8'));
  } catch {
    return [];
  }
};

const savePayments = (payments) => {
  fs.writeFileSync(paymentsPath, JSON.stringify(payments, null, 2), 'utf-8');
};

const formatBRL = (value) => {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const addLog = (payment, entry) => {
  payment.logs = payment.logs || [];
  payment.logs.push({ ...entry, timestamp: new Date().toISOString() });
};

const authInfoPath = path.join(__dirname, 'auth_info');
let socketInstance = null;

const initWhatsApp = async () => {
  if (!fs.existsSync(authInfoPath)) {
    fs.mkdirSync(authInfoPath, { recursive: true });
  }

  const pino = require('pino');
  const { state, saveCreds } = await useMultiFileAuthState(authInfoPath);
  const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) });
  socketInstance = sock;

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('>> Escaneie o QR Code abaixo com seu WhatsApp:');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada. Reconectando:', shouldReconnect);
      if (shouldReconnect) setTimeout(() => initWhatsApp(), 5000);
    } else if (connection === 'open') {
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

    // ID da mensagem que foi respondida (stanzaId = chave primária do vínculo)
    const quotedMsgId = contextInfo?.stanzaId;
    const adminSender = message.key.participant || message.key.remoteJid;

    console.log(`>> Grupo | Admin: ${adminSender.split('@')[0]} | "${text.substring(0, 50)}"`);

    let allPayments = loadPayments();
    let payment = null;
    let identifiedBy = null;

    // Método 1 (mais seguro): resposta direta à mensagem original do pedido
    if (quotedMsgId) {
      payment = allPayments.find(p => p.groupMessageId === quotedMsgId);
      if (payment) identifiedBy = 'resposta-direta';
    }

    // Método 2: UUID do pedido presente no texto da mensagem atual
    if (!payment) {
      const idMatch = text.match(/ID:\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (idMatch) {
        payment = allPayments.find(p => p.id === idMatch[1]);
        if (payment) identifiedBy = 'id-no-texto';
      }
    }

    // Método 3: UUID na mensagem citada (compatibilidade com pedidos antigos sem groupMessageId)
    if (!payment && contextInfo?.quotedMessage) {
      const quotedText = contextInfo.quotedMessage.conversation ||
                         contextInfo.quotedMessage.extendedTextMessage?.text ||
                         contextInfo.quotedMessage.imageMessage?.caption || '';
      const idMatch = quotedText.match(/ID:\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (idMatch) {
        payment = allPayments.find(p => p.id === idMatch[1]);
        if (payment) identifiedBy = 'id-na-mensagem-citada';
      }
    }

    if (!payment) {
      if (text.length > 5) {
        console.log(`>> Mensagem ignorada: pedido não identificado.`);
      }
      return;
    }

    console.log(`>> Pedido ${payment.id} | Método: [${identifiedBy}] | Admin: ${adminSender.split('@')[0]}`);

    // Recarrega para consistência em pedidos simultâneos
    allPayments = loadPayments();
    const paymentIndex = allPayments.findIndex(p => p.id === payment.id);
    const currentPayment = allPayments[paymentIndex];

    // Comando PAGO: confirma o pagamento sem encaminhar ao cliente
    if (upperText.startsWith('PAGO')) {
      currentPayment.status = 'paid';
      addLog(currentPayment, {
        type: 'status_update',
        status: 'paid',
        admin: adminSender,
        details: 'Pagamento confirmado via WhatsApp'
      });
      savePayments(allPayments);
      console.log(`>> Pedido ${payment.id} marcado como PAGO.`);
      return;
    }

    // Armazena PIX Copia e Cola no banco se detectado no texto
    const pixMatch = text.match(/000201[\s\S]*?6304[A-Fa-f0-9]{4}/);
    if (pixMatch) {
      currentPayment.qrCode = pixMatch[0].trim();
      console.log(`>> PIX Copia e Cola armazenado para pedido ${payment.id}`);
    }

    // Encaminha conteúdo ao cliente correto
    const clientPhone = currentPayment.clientPhone;
    if (!clientPhone) {
      console.warn(`>> Pedido ${payment.id}: cliente sem telefone cadastrado, encaminhamento impossível.`);
      addLog(currentPayment, {
        type: 'forward_error',
        admin: adminSender,
        details: 'Telefone do cliente não disponível no pedido'
      });
      savePayments(allPayments);
      return;
    }

    const clientJid = `${clientPhone.replace(/\D/g, '')}@s.whatsapp.net`;

    try {
      const mediaType = ['imageMessage', 'documentMessage', 'videoMessage', 'audioMessage']
        .find(t => msgContent[t]);

      if (mediaType) {
        const buffer = await downloadMediaMessage(message, 'buffer', {}, {
          reuploadRequest: sock.updateMediaMessage
        });

        const mediaInfo = msgContent[mediaType];
        const caption = text || '';

        if (mediaType === 'imageMessage') {
          await sock.sendMessage(clientJid, { image: buffer, caption });
        } else if (mediaType === 'videoMessage') {
          await sock.sendMessage(clientJid, { video: buffer, caption });
        } else if (mediaType === 'audioMessage') {
          await sock.sendMessage(clientJid, { audio: buffer, ptt: mediaInfo.ptt || false });
        } else if (mediaType === 'documentMessage') {
          await sock.sendMessage(clientJid, {
            document: buffer,
            mimetype: mediaInfo.mimetype || 'application/octet-stream',
            fileName: mediaInfo.fileName || 'arquivo',
            caption
          });
        }

        addLog(currentPayment, {
          type: 'forward_success',
          admin: adminSender,
          contentType: mediaType,
          clientRecipient: clientPhone,
          details: `${mediaType} encaminhado para ${clientPhone}`
        });
        console.log(`>> [${mediaType}] encaminhado ao cliente ${clientPhone} | Pedido ${payment.id}`);

      } else if (text.trim()) {
        await sock.sendMessage(clientJid, { text });
        addLog(currentPayment, {
          type: 'forward_success',
          admin: adminSender,
          contentType: 'text',
          clientRecipient: clientPhone,
          details: `Texto encaminhado: "${text.substring(0, 80)}"`
        });
        console.log(`>> Texto encaminhado ao cliente ${clientPhone} | Pedido ${payment.id}`);
      }

      savePayments(allPayments);

    } catch (err) {
      console.error(`>> Erro ao encaminhar para ${clientPhone}:`, err.message);
      addLog(currentPayment, {
        type: 'forward_error',
        admin: adminSender,
        details: `Erro ao encaminhar: ${err.message}`
      });
      savePayments(allPayments);
    }
  });

  sock.ev.on('creds.update', async () => {
    await saveCreds();
  });

  return sock;
};

const sendPaymentRequest = async (sock, paymentId, product, amount, clientPhone) => {
  if (!WHATSAPP_GROUP_ID) {
    console.error('ERRO: WHATSAPP_GROUP_ID não definido no arquivo .env');
    return null;
  }

  const now = new Date().toLocaleString('pt-BR');
  const phone = clientPhone ? clientPhone.replace(/\D/g, '') : 'Não informado';

  const message = [
    '🛒 NOVO PEDIDO',
    '',
    `ID: ${paymentId}`,
    `Produto: ${product}`,
    `Valor: ${formatBRL(amount)}`,
    `Telefone: ${phone}`,
    `Data: ${now}`,
    '',
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

module.exports = { initWhatsApp, sendPaymentRequest, getSocket };
