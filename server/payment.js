const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getSocket, sendPaymentRequest } = require('./whatsapp');
const tracker = require('./tracker');
const audit = require('./audit');

const paymentsPath = path.join(__dirname, 'data', 'payments.json');
const usersPath = path.join(__dirname, 'data', 'users.json');
const proofsDir = path.join(__dirname, 'data', 'proofs');

const loadUsers = () => {
  try { return JSON.parse(fs.readFileSync(usersPath, 'utf-8')); } catch (e) { return []; }
};

const getAuthUser = (req) => {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (!token) return null;
  return loadUsers().find(u => u.token === token) || null;
};

if (!fs.existsSync(proofsDir)) {
  fs.mkdirSync(proofsDir, { recursive: true });
}

// Garante que o arquivo de pagamentos exista
const dataDir = path.dirname(paymentsPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(paymentsPath)) {
  fs.writeFileSync(paymentsPath, '[]', 'utf-8');
}

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

const formatBRL = (value) => {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

// Gera um novo ID de pagamento
router.post('/generate', async (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Você precisa estar logado para finalizar a compra.' });
  }

  const enderecos = user.enderecos || [];
  if (enderecos.length === 0) {
    return res.status(400).json({ success: false, error: 'Cadastre um endereço de entrega antes de finalizar a compra.' });
  }

  const { productId, amount, productName, addressId } = req.body;
  if (!productId || !amount) {
    return res.status(400).json({ success: false, error: 'Dados do pedido incompletos.' });
  }

  const address = enderecos.find(a => a.id === addressId) || enderecos.find(a => a.principal) || enderecos[0];

  const paymentId = uuidv4();
  const payments = loadPayments();

  const newPayment = {
    id: paymentId,
    productId,
    productName,
    amount,
    status: 'pending',
    createdAt: new Date().toISOString(),
    qrCode: null,
    clientId: req.ip,
    userId: user.id,
    clientPhone: user.whatsapp || null,
    groupMessageId: null,
    address,
    proofs: [],
    logs: []
  };

  payments.push(newPayment);

  // Notifica o grupo e vincula o ID da mensagem ao pedido
  const sock = getSocket();
  if (sock) {
    const messageId = await sendPaymentRequest(sock, paymentId, productName || productId, amount, user.whatsapp);
    newPayment.groupMessageId = messageId;
    newPayment.logs.push({
      timestamp: new Date().toISOString(),
      type: 'order_created',
      details: messageId
        ? `Notificação enviada ao grupo WhatsApp. MessageID: ${messageId}`
        : 'Pedido criado sem notificação WhatsApp (socket offline)'
    });
  } else {
    newPayment.logs.push({
      timestamp: new Date().toISOString(),
      type: 'order_created',
      details: 'Pedido criado sem notificação WhatsApp (socket offline)'
    });
  }

  savePayments(payments);
  tracker.record('order_created', { productId, productName, amount });
  audit.append('order_created', user.email, req.ip, { paymentId, productName, amount });
  res.json({ success: true, paymentId });
});

// Atualiza o status do pagamento
router.post('/update', (req, res) => {
  const { paymentId, status } = req.body;
  const payments = loadPayments();
  const payment = payments.find(p => p.id === paymentId);
  
  if (!payment) {
    return res.status(404).json({ success: false, error: 'Pagamento não encontrado' });
  }
  
  payment.status = status;
  savePayments(payments);
  
  res.json({ success: true });
});

router.post('/proof', async (req, res) => {
  const { paymentId, customerName, customerPhone, productName, amount, fileName, mimeType, fileData } = req.body;
  if (!paymentId || !fileName || !mimeType || !fileData) {
    return res.status(400).json({ success: false, error: 'Dados de comprovante incompletos.' });
  }

  const payments = loadPayments();
  const payment = payments.find(p => p.id === paymentId);
  if (!payment) {
    return res.status(404).json({ success: false, error: 'Pagamento não encontrado.' });
  }

  if (payment.proofs && payment.proofs.length > 0) {
    return res.status(409).json({ success: false, error: 'Comprovante já enviado para este pedido.' });
  }

  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storedFileName = `${paymentId}_${Date.now()}_${safeFileName}`;
  const filePath = path.join(proofsDir, storedFileName);

  try {
    fs.writeFileSync(filePath, Buffer.from(fileData, 'base64'));
  } catch (error) {
    console.error('Erro ao salvar comprovante:', error);
    return res.status(500).json({ success: false, error: 'Falha ao salvar o comprovante.' });
  }

  const proofRecord = {
    id: uuidv4(),
    fileName,
    storedFileName,
    mimeType,
    uploadedAt: new Date().toISOString(),
    customerName: customerName || 'Não informado',
    customerPhone: customerPhone || 'Não informado'
  };

  payment.proofs = payment.proofs || [];
  payment.proofs.push(proofRecord);
  payment.status = 'awaiting_validation';
  savePayments(payments);

  const sock = getSocket();
  if (sock) {
    try {
      const caption = `NOVO COMPROVANTE DE PAGAMENTO\n\nID: ${paymentId}\nCliente: ${customerName || 'Não informado'}\nTelefone: ${customerPhone || 'Não informado'}\nPedido: ${productName || payment.productName || payment.productId}\nValor: ${formatBRL(amount || payment.amount)}\nData/Hora: ${new Date().toLocaleString('pt-BR')}`;
      const media = {
        mimetype: mimeType,
        fileName,
        url: `data:${mimeType};base64,${fileData}`
      };

      if (mimeType.startsWith('image/')) {
        await sock.sendMessage(process.env.WHATSAPP_GROUP_ID, { image: media, caption });
      } else {
        await sock.sendMessage(process.env.WHATSAPP_GROUP_ID, { document: media, caption });
      }
    } catch (error) {
      console.error('Erro ao enviar comprovante para o WhatsApp:', error);
    }
  } else {
    console.warn('WhatsApp não conectado. Comprovante salvo localmente.');
  }

  res.json({ success: true, status: 'awaiting_validation' });
});

// Obtém o status do pagamento
router.get('/status/:id', (req, res) => {
  const payments = loadPayments();
  const payment = payments.find(p => p.id === req.params.id);
  
  if (!payment) {
    return res.status(404).json({ success: false, error: 'Pagamento não encontrado' });
  }
  
  res.json({
    success: true,
    status: payment.status,
    qrCode: payment.qrCode,
    amount: payment.amount,
    productName: payment.productName,
    proofs: payment.proofs || []
  });
});

router.get('/all', (req, res) => {
  const payments = loadPayments();
  res.json(payments);
});

module.exports = router;