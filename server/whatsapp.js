const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const paymentsPath = path.join(__dirname, 'data', 'payments.json');
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID;

// Carrega os pagamentos existentes
const loadPayments = () => {
  try {
    const file = fs.readFileSync(paymentsPath, 'utf-8');
    return JSON.parse(file);
  } catch (error) {
    console.error('Erro ao carregar pagamentos:', error);
    return [];
  }
};

// Salva os pagamentos
const savePayments = (payments) => {
  fs.writeFileSync(paymentsPath, JSON.stringify(payments, null, 2), 'utf-8');
};

// Path for WhatsApp authentication credentials
const authInfoPath = path.join(__dirname, 'auth_info');
let socketInstance = null;

const initWhatsApp = async () => {
  // Ensure the auth_info directory exists
  if (!fs.existsSync(authInfoPath)) {
    fs.mkdirSync(authInfoPath, { recursive: true });
  }

  const pino = require("pino");
  const { state, saveCreds } = await useMultiFileAuthState(authInfoPath);
  const sock = makeWASocket({ auth: state, logger: pino({ level: "silent" }) });
  socketInstance = sock;

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Se um QR Code for gerado, exibe no terminal
    if (qr) {
      console.log('>> Escaneie o QR Code abaixo com seu WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada. Reconectando:', shouldReconnect);
      if (shouldReconnect) {
        setTimeout(() => initWhatsApp(), 5000);
      }
    } else if (connection === 'open') {
      console.log('Conexão com WhatsApp estabelecida com sucesso!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message.message) return;

    // Ignora mensagens enviadas pelo próprio bot
    if (message.key.fromMe) {
      return;
    }

    const jid = message.key.remoteJid;
    if (jid === WHATSAPP_GROUP_ID) {
      // Captura o texto de mensagens simples, respostas ou legendas de imagens
      const text = message.message.conversation || 
                   message.message.extendedTextMessage?.text || 
                   message.message.imageMessage?.caption || '';
      const upperText = text.toUpperCase();

      console.log(`>> Mensagem recebida no grupo: "${text.substring(0, 30)}..."`);

      // Tenta encontrar o ID do pagamento (formato UUID com hifens)
      let paymentId = text.match(/ID:\s*([a-f0-9\-]+)/i)?.[1];

      // Se não houver ID no texto, verifica se é uma RESPOSTA a uma mensagem que tem o ID
      const contextInfo = message.message.extendedTextMessage?.contextInfo || 
                          message.message.imageMessage?.contextInfo;
      const quotedMsg = contextInfo?.quotedMessage;

      if (!paymentId && quotedMsg) {
        // O Baileys pode colocar o texto da mensagem citada em vários lugares
        const quotedText = quotedMsg.conversation ||
                           quotedMsg.extendedTextMessage?.text ||
                           quotedMsg.imageMessage?.caption ||
                           quotedMsg.buttonsMessage?.contentText ||
                           quotedMsg.viewOnceMessageV2?.message?.imageMessage?.caption ||
                           '';
        
        console.log(`>> Verificando ID na mensagem respondida: "${quotedText.substring(0, 30)}..."`);
        paymentId = quotedText.match(/ID:\s*([a-f0-9\-]+)/i)?.[1];
      }

      // FALLBACK: Se detectado código PIX ou comando "PAGO" sem ID claro, vincula ao pendente mais recente
      if (!paymentId) {
        const isPix = text.trim().includes('000201');
        const isPaid = upperText.startsWith('PAGO');
        
        if (isPix || isPaid) {
          const payments = loadPayments();
          const pendingPayments = payments.filter(p => p.status === 'pending')
                                          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          if (pendingPayments.length > 0) {
            paymentId = pendingPayments[0].id;
            console.log(`>> ID não identificado. Vinculando automaticamente ao pagamento pendente mais recente: ${paymentId}`);
          }
        }
      }

      if (paymentId) {
        const payments = loadPayments();
        const payment = payments.find(p => p.id === paymentId);

        if (payment) {
          if (upperText.startsWith('PAGO')) {
            payment.status = 'paid';
            savePayments(payments);
            console.log(`>> Pagamento ${paymentId} confirmado!`);
          } else if (text.trim().includes('000201') || text.toLowerCase().includes('qr code')) {
            // Busca o código PIX completo. 
            // O padrão oficial começa com 000201 e termina com o identificador de CRC16 (6304 seguido de 4 caracteres)
            // Usamos [\s\S]*? para capturar espaços, quebras de linha e caracteres especiais no meio do código.
            const pixMatch = text.match(/000201[\s\S]*?6304[A-Fa-f0-9]{4}/);
            if (pixMatch) {
              payment.qrCode = pixMatch[0].trim();
            } else {
              // Fallback: se não achar o padrão de fechamento, captura tudo a partir de 000201
              const fallbackMatch = text.match(/000201[\s\S]+/);
              payment.qrCode = fallbackMatch ? fallbackMatch[0].trim() : text.trim();
            }
            savePayments(payments);
            console.log(`>> QR Code PIX vinculado ao pagamento ${paymentId}`);
          }
        } else {
          console.log(`>> Mensagem recebida com ID ${paymentId}, mas esse pagamento não existe no sistema.`);
        }
      } else if (text.length > 10) {
        console.log(`>> Mensagem ignorada no grupo: não foi possível identificar o ID do pagamento ou não é uma resposta.`);
      }
    }
  });

  sock.ev.on('creds.update', async () => {
    await saveCreds();
  });

  return sock;
};

const sendPaymentRequest = async (sock, paymentId, product, amount) => {
  // Verifica se o ID do grupo está configurado para evitar o erro de destruturação do jidDecode
  if (!WHATSAPP_GROUP_ID) {
    console.error('ERRO: WHATSAPP_GROUP_ID não definido no arquivo .env');
    return;
  }

  const message = `NOVA SOLICITAÇÃO DE PAGAMENTO\n\nID: ${paymentId}\nProduto: ${product}\nValor: €${amount}\n\nEnvie o QR Code PIX/TEXT correspondente para este ID.`;
  await sock.sendMessage(WHATSAPP_GROUP_ID, { text: message });
};

const getSocket = () => socketInstance;

module.exports = { initWhatsApp, sendPaymentRequest, getSocket };