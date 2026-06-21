const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getSocket, sendPaymentRequest } = require('./whatsapp');
const { generatePix } = require('./pix');
const telegram = require('./telegram');
const tracker = require('./tracker');
const audit = require('./audit');
const { validateCoupon, recordCouponUse } = require('./coupons');

const paymentsPath = path.join(__dirname, 'data', 'payments.json');
const usersPath    = path.join(__dirname, 'data', 'users.json');
const configPath   = path.join(__dirname, 'data', 'config.json');
const proofsDir    = path.join(__dirname, 'data', 'proofs');

// ── Helpers ──────────────────────────────────────────────────────────────────

const loadUsers    = () => { try { return JSON.parse(fs.readFileSync(usersPath,    'utf-8')); } catch { return []; } };
const loadPayments = () => { try { return JSON.parse(fs.readFileSync(paymentsPath, 'utf-8')); } catch { return []; } };
const savePayments = (p) => fs.writeFileSync(paymentsPath, JSON.stringify(p, null, 2), 'utf-8');
const loadConfig   = () => { try { return JSON.parse(fs.readFileSync(configPath,   'utf-8')); } catch { return {}; } };

const formatBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const getAuthUser = (req) => {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (!token) return null;
  return loadUsers().find(u => u.token === token) || null;
};

// Simple admin check used only within this router
const isAdmin = (req) => {
  const adminToken = req.headers['x-admin-token'] || req.query.adminToken;
  if (adminToken && process.env.ADMIN_TOKEN && adminToken === process.env.ADMIN_TOKEN) return true;
  const ut = req.headers['x-auth-token'] || req.query.token;
  if (ut) {
    const u = loadUsers().find(u => u.token === ut);
    if (u && ['admin', 'superadmin'].includes(u.role)) return true;
  }
  return false;
};

// Gera shortId único (PED + 5 dígitos), sem colisão
const generateShortId = (payments) => {
  let id;
  do { id = 'PED' + String(Math.floor(10000 + Math.random() * 90000)); }
  while (payments.some(p => p.shortId === id));
  return id;
};

// ── Init de diretórios/arquivos ───────────────────────────────────────────────

if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true });
if (!fs.existsSync(path.dirname(paymentsPath))) fs.mkdirSync(path.dirname(paymentsPath), { recursive: true });
if (!fs.existsSync(paymentsPath)) fs.writeFileSync(paymentsPath, '[]', 'utf-8');

// ── Rotas ─────────────────────────────────────────────────────────────────────

// Gera um novo pedido com PIX automático
router.post('/generate', async (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Você precisa estar logado para finalizar a compra.' });

  const enderecos = user.enderecos || [];
  if (enderecos.length === 0) return res.status(400).json({ success: false, error: 'Cadastre um endereço de entrega antes de finalizar a compra.' });

  const { productId, amount: rawAmount, productName, addressId, paymentMethod, installments, cardName, cardNumber, cardExpiry, cardCvv, cardLast4, seguro, seguroLabel, couponCode } = req.body;
  if (!rawAmount) return res.status(400).json({ success: false, error: 'Dados do pedido incompletos.' });

  const address = enderecos.find(a => a.id === addressId) || enderecos.find(a => a.principal) || enderecos[0];

  // Aplica cupom no servidor (validação dupla — o cliente pode ter manipulado o valor)
  let couponDiscount = 0;
  let couponFreeShipping = false;
  let couponResult = null;
  if (couponCode) {
    const payments = loadPayments();
    const isFirstPurchase = payments.filter(p => p.userId === user.id).length === 0;
    couponResult = validateCoupon(couponCode, {
      amount: rawAmount,
      userId: user.id,
      productId,
      paymentMethod: paymentMethod === 'cartao' ? 'cartao' : 'pix',
      isFirstPurchase,
    });
    if (couponResult.valid) {
      couponDiscount = couponResult.discount || 0;
      couponFreeShipping = couponResult.freeShipping || false;
    }
  }

  const amount = Math.max(0, rawAmount - couponDiscount);

  const payments = loadPayments();
  const paymentId = uuidv4();
  const shortId   = generateShortId(payments);

  // ── Gera PIX automático se a chave estiver configurada (apenas PIX) ─────
  const cfg    = loadConfig();
  const pixCfg = cfg.pixConfig || {};
  let pixCode  = null;
  const isCartao = paymentMethod === 'cartao';

  if (!isCartao && pixCfg.pixKey) {
    try {
      pixCode = generatePix({
        key:         pixCfg.pixKey,
        name:        (pixCfg.receiverName || 'Jessi iPhones').substring(0, 25),
        city:        (pixCfg.receiverCity || 'Rio de Janeiro').substring(0, 15),
        amount,
        txid:        shortId,
        description: (productName || productId || 'Compra').substring(0, 72)
      });
    } catch (e) {
      console.error('[PIX] Erro ao gerar código:', e.message);
    }
  }

  const newPayment = {
    id: paymentId,
    shortId,
    productId:    productId || null,
    productName:  productName || null,
    amount,
    status:          'pending',
    createdAt:       new Date().toISOString(),
    qrCode:          pixCode,
    paymentMethod:   isCartao ? 'cartao' : 'pix',
    installments:    isCartao ? (installments || 1) : null,
    cardName:        isCartao ? (cardName || null) : null,
    cardNumber:      isCartao ? (cardNumber || null) : null,
    cardExpiry:      isCartao ? (cardExpiry || null) : null,
    cardLast4:       isCartao ? (cardLast4 || null) : null,
    seguro:          seguro || 0,
    seguroLabel:     seguroLabel || null,
    clientId:        req.ip,
    userId:          user.id,
    clientName:      user.nome || null,
    clientEmail:     user.email || null,
    clientPhone:     user.whatsapp || null,
    clientCpf:       user.cpf || null,
    couponCode:      couponCode || null,
    couponDiscount:  couponDiscount || 0,
    couponFreeShipping: couponFreeShipping || false,
    groupMessageId:  null,
    proofGroupMessageId: null,
    address,
    proofs:          [],
    logs:            []
  };

  payments.push(newPayment);

  // ── Notifica o grupo WhatsApp ─────────────────────────────────────────────
  const sock = getSocket();
  if (sock) {
    const messageId = await sendPaymentRequest(sock, paymentId, shortId, productName || productId || 'Compra', amount, user.whatsapp, pixCode, {
      paymentMethod: isCartao ? 'cartao' : 'pix',
      cardNumber:   newPayment.cardNumber,
      cardName:     newPayment.cardName,
      cardExpiry:   newPayment.cardExpiry,
      installments: newPayment.installments,
      // Dados do cliente para mensagem completa
      clientName:  user.nome,
      clientEmail: user.email,
      clientCpf:   user.cpf,
      address,
    });
    newPayment.groupMessageId = messageId;
    newPayment.logs.push({
      timestamp: new Date().toISOString(),
      type:      'order_created',
      details:   messageId
        ? `Notificação enviada ao grupo. MessageID: ${messageId}`
        : 'Pedido criado sem notificação WhatsApp (socket offline)'
    });
  } else {
    newPayment.logs.push({
      timestamp: new Date().toISOString(),
      type:    'order_created',
      details: 'Pedido criado sem notificação WhatsApp (socket offline)'
    });
    // Fallback: notifica via Telegram quando WhatsApp está offline
    const shortDisplay = `#${newPayment.shortId}`;
    const tgMsg = [
      `⚠️ *NOVO PEDIDO — WhatsApp offline*`,
      ``,
      `📋 *Pedido:* ${shortDisplay}`,
      `🛍️ *Produto:* ${productName || productId || 'N/A'}`,
      `💰 *Valor:* ${formatBRL(amount)}`,
      `💳 *Método:* ${isCartao ? 'Cartão' : 'PIX'}`,
      ``,
      `👤 *Cliente:* ${user.nome || 'N/A'}`,
      `📞 *WhatsApp:* ${user.whatsapp || 'N/A'}`,
      `📧 *E-mail:* ${user.email || 'N/A'}`,
      ``,
      `⚡ Reconecte o WhatsApp para processar este pedido.`
    ].join('\n');
    telegram.send(tgMsg).catch(() => {});
  }

  savePayments(payments);
  // Registra uso do cupom após salvar o pedido
  if (couponCode && couponResult && couponResult.valid) {
    try { recordCouponUse(couponCode, paymentId); } catch (e) { console.error('[Cupom] Erro ao registrar uso:', e.message); }
  }
  tracker.record('order_created', { productId, productName, amount });
  if (pixCode) tracker.record('pix_generated', { productId, amount });
  audit.append('order_created', user.email, req.ip, { paymentId, shortId, productName, amount, pixGenerated: !!pixCode });

  res.json({ success: true, paymentId, shortId });
});

// Atualiza status (uso interno / legacy)
router.post('/update', (req, res) => {
  const { paymentId, status } = req.body;
  const payments = loadPayments();
  const payment  = payments.find(p => p.id === paymentId);
  if (!payment) return res.status(404).json({ success: false, error: 'Pagamento não encontrado' });
  payment.status = status;
  savePayments(payments);
  res.json({ success: true });
});

// Upload de comprovante
router.post('/proof', async (req, res) => {
  const { paymentId, customerName, customerPhone, productName, amount, fileName, mimeType, fileData } = req.body;
  if (!paymentId || !fileName || !mimeType || !fileData) {
    return res.status(400).json({ success: false, error: 'Dados de comprovante incompletos.' });
  }

  const payments = loadPayments();
  const payment  = payments.find(p => p.id === paymentId);
  if (!payment) return res.status(404).json({ success: false, error: 'Pagamento não encontrado.' });

  if (payment.proofs && payment.proofs.length > 0) {
    return res.status(409).json({ success: false, error: 'Comprovante já enviado para este pedido.' });
  }

  const safeFileName   = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storedFileName = `${paymentId}_${Date.now()}_${safeFileName}`;
  const filePath       = path.join(proofsDir, storedFileName);

  try {
    fs.writeFileSync(filePath, Buffer.from(fileData, 'base64'));
  } catch (error) {
    console.error('Erro ao salvar comprovante:', error);
    return res.status(500).json({ success: false, error: 'Falha ao salvar o comprovante.' });
  }

  const proofRecord = {
    id:           uuidv4(),
    fileName,
    storedFileName,
    mimeType,
    uploadedAt:   new Date().toISOString(),
    customerName:  customerName  || 'Não informado',
    customerPhone: customerPhone || 'Não informado'
  };

  payment.proofs = payment.proofs || [];
  payment.proofs.push(proofRecord);
  payment.status = 'awaiting_validation';
  savePayments(payments);

  // ── Notifica grupo WhatsApp com o comprovante ─────────────────────────────
  const sock = getSocket();
  if (sock) {
    try {
      const shortDisplay = payment.shortId ? `#${payment.shortId}` : payment.id.slice(0, 8);
      const addrObj = payment.address;
      const addrLine = addrObj
        ? `${addrObj.rua}, ${addrObj.numero}${addrObj.complemento ? ' '+addrObj.complemento : ''} — ${addrObj.bairro}, ${addrObj.cidade}/${addrObj.estado} · CEP ${addrObj.cep}`
        : 'Não informado';
      // Formata CPF para exibição
      const cpfRaw = payment.clientCpf || '';
      const cpfFmt = cpfRaw.length === 11
        ? `${cpfRaw.slice(0,3)}.${cpfRaw.slice(3,6)}.${cpfRaw.slice(6,9)}-${cpfRaw.slice(9)}`
        : (cpfRaw || 'Não informado');

      const caption = [
        '━━━━━━━━━━━━━━━',
        '💰 *COMPROVANTE RECEBIDO — AGUARDANDO ANÁLISE*',
        '━━━━━━━━━━━━━━━',
        '',
        `📋 *Pedido:* ${shortDisplay}`,
        `🆔 *ID:* ${payment.id}`,
        `🛍️ *Produto:* ${productName || payment.productName || payment.productId || 'Não informado'}`,
        `💰 *Valor:* ${formatBRL(amount || payment.amount)}`,
        `📅 *Data do pedido:* ${payment.createdAt ? new Date(payment.createdAt).toLocaleString('pt-BR') : 'N/A'}`,
        `📅 *Comprovante em:* ${new Date().toLocaleString('pt-BR')}`,
        '',
        '👤 *Dados do Cliente*',
        `Nome:     ${payment.clientName || customerName || 'Não informado'}`,
        `CPF:      ${cpfFmt}`,
        `Telefone: ${customerPhone || payment.clientPhone || 'Não informado'}`,
        `E-mail:   ${payment.clientEmail || 'Não informado'}`,
        `Login:    ${payment.clientEmail || 'Não informado'}`,
        '',
        '📦 *Endereço de Entrega*',
        addrLine,
        '',
        '↩️ *Responda esta mensagem:*',
        'APROVADO — confirmar pagamento e notificar cliente',
        'RECUSADO [motivo] — recusar e informar motivo ao cliente',
        'REENVIAR — pedir novo comprovante ao cliente',
        '━━━━━━━━━━━━━━━'
      ].join('\n');

      let sent;
      if (mimeType.startsWith('image/')) {
        sent = await sock.sendMessage(process.env.WHATSAPP_GROUP_ID, {
          image: { url: `data:${mimeType};base64,${fileData}` },
          caption
        });
      } else {
        sent = await sock.sendMessage(process.env.WHATSAPP_GROUP_ID, {
          document: { url: `data:${mimeType};base64,${fileData}` },
          mimetype: mimeType,
          fileName,
          caption
        });
      }

      // Salva o ID da mensagem do comprovante para reply do admin
      const proofMsgId = sent?.key?.id || null;
      if (proofMsgId) {
        const all = loadPayments();
        const idx = all.findIndex(p => p.id === paymentId);
        if (idx !== -1) {
          all[idx].proofGroupMessageId = proofMsgId;
          all[idx].logs = all[idx].logs || [];
          all[idx].logs.push({
            timestamp: new Date().toISOString(),
            type:    'proof_sent_to_group',
            details: `Comprovante enviado ao grupo. MessageID: ${proofMsgId}`
          });
          savePayments(all);
        }
      }
    } catch (error) {
      console.error('Erro ao enviar comprovante para o WhatsApp:', error);
    }
  } else {
    console.warn('WhatsApp não conectado. Comprovante salvo localmente.');
  }

  res.json({ success: true, status: 'awaiting_validation' });
});

// Status do pagamento (polling do cliente)
router.get('/status/:id', (req, res) => {
  const payments = loadPayments();
  const payment  = payments.find(p => p.id === req.params.id);
  if (!payment) return res.status(404).json({ success: false, error: 'Pagamento não encontrado' });

  res.json({
    success:     true,
    status:      payment.status,
    shortId:     payment.shortId || null,
    qrCode:      payment.qrCode,
    amount:      payment.amount,
    productName: payment.productName,
    proofs:      payment.proofs || [],
    refuseReason: payment.refuseReason || null
  });
});

// Lista todos (uso admin)
router.get('/all', (req, res) => {
  res.json(loadPayments());
});

module.exports = router;
