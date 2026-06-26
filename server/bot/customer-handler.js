'use strict';
const fs   = require('fs');
const path = require('path');

const catalog   = require('./catalog-reader');
const store     = require('./conversation-store');
const intent    = require('./intent-engine');
const sanitizer = require('./message-sanitizer');
const logger    = require('./bot-logger');

const CONFIG_PATH   = path.join(__dirname, '..', 'data', 'bot', 'config.json');
const PAYMENTS_PATH = path.join(__dirname, '..', 'data', 'payments.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); }
  catch { return { enabled: false, mode: 'allowlist', allowedTestPhones: [], maxRepliesPerMinute: 6, ignoreMessagesOlderThanSeconds: 60, campaignCodes: [], siteUrl: '', conversationTtlDays: 30 }; }
}

function loadPayments() {
  try { return JSON.parse(fs.readFileSync(PAYMENTS_PATH, 'utf-8')); } catch { return []; }
}

function phoneKey(jid) {
  return String(jid || '').replace('@s.whatsapp.net', '').replace(/\D/g, '');
}

function fmt(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function productCard(p, siteUrl) {
  const lines = [`*${p.name}*`];
  if (p.model)     lines.push(`📱 Modelo: ${p.model}`);
  if (p.color)     lines.push(`🎨 Cor: ${p.color}`);
  if (p.storage)   lines.push(`💾 Armazenamento: ${p.storage}`);
  if (p.condition) lines.push(`✨ Condição: ${p.condition}`);
  if (p.priceOriginal && p.priceOriginal > p.price) {
    lines.push(`💰 De: ${fmt(p.priceOriginal)} → Por: *${fmt(p.price)}*`);
  } else if (p.price > 0) {
    lines.push(`💰 Preço: *${fmt(p.price)}*`);
  }
  lines.push(p.stock > 0 ? '✅ Disponível no catálogo' : '⛔ Indisponível no momento');
  lines.push(`🔗 ${siteUrl}/product?id=${p.id}`);
  return lines.join('\n');
}

async function send(sock, jid, text) {
  try { await sock.sendMessage(jid, { text }); }
  catch (err) { logger.error('Erro ao enviar mensagem ao cliente', { jid, error: err.message }); }
}

async function handleProof(sock, message, phone, jid, msgContent, mediaType, groupId) {
  if (!groupId) {
    logger.warn('WHATSAPP_GROUP_ID não configurado — comprovante não encaminhado', { phone });
    return;
  }

  const payments     = loadPayments();
  const pPhone       = phone;
  const pendingOrders = payments.filter(p => {
    const pp = String(p.clientPhone || '').replace(/\D/g, '');
    return pp === pPhone && ['pending', 'awaiting_validation'].includes(p.status);
  });

  if (pendingOrders.length === 0) {
    await send(sock, jid, [
      'Recebi sua imagem, mas não encontrei pedidos pendentes para este número.',
      '',
      'Se você tem um pedido, envie o código (ex: *PED12345*) para eu localizar.'
    ].join('\n'));
    return;
  }

  if (pendingOrders.length > 1) {
    await send(sock, jid, [
      'Encontrei mais de um pedido pendente associado a este número.',
      '',
      'Envie o código do seu pedido (ex: *PED12345*) para eu encaminhar o comprovante corretamente.'
    ].join('\n'));
    return;
  }

  const order     = pendingOrders[0];
  const shortRef  = order.shortId || order.id.slice(0, 8);
  const now       = new Date().toLocaleString('pt-BR');

  const adminCaption = [
    '📨 *COMPROVANTE RECEBIDO VIA BOT*',
    '━━━━━━━━━━━━━━━━━━━━',
    `📋 Pedido: *#${shortRef}*`,
    `🆔 ID: ${order.id}`,
    `🛍️ Produto: ${order.productName || order.productId || 'N/A'}`,
    `💰 Valor: ${fmt(order.amount)}`,
    `📱 Telefone: ${phone}`,
    `👤 Cliente: ${order.clientName || 'Não identificado'}`,
    `🕒 Recebido: ${now}`,
    '━━━━━━━━━━━━━━━━━━━━',
    '↩️ Responda esta mensagem com:',
    `APROVADO #${shortRef}`,
    `RECUSADO #${shortRef} [motivo]`,
    `REENVIAR #${shortRef}`,
  ].join('\n');

  try {
    const { downloadMediaMessage } = require('@whiskeysockets/baileys');

    if (mediaType === 'imageMessage') {
      const buffer = await downloadMediaMessage(message, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      await sock.sendMessage(groupId, { image: buffer, caption: adminCaption });
    } else if (mediaType === 'documentMessage') {
      const buffer = await downloadMediaMessage(message, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      const info   = msgContent.documentMessage;
      await sock.sendMessage(groupId, {
        document: buffer,
        mimetype: info?.mimetype || 'application/octet-stream',
        fileName: info?.fileName || 'comprovante',
        caption:  adminCaption,
      });
    } else {
      await sock.sendMessage(groupId, { text: adminCaption + '\n\n(Mídia não suportada para encaminhamento automático)' });
    }

    logger.info('Comprovante encaminhado ao grupo admin', { phone, orderId: order.id });
  } catch (err) {
    logger.error('Erro ao encaminhar comprovante ao grupo', { phone, error: err.message });
  }

  await send(sock, jid, [
    'Comprovante recebido e enviado para análise. ✅',
    '',
    'Você receberá uma atualização assim que a equipe validar o pagamento.',
    '',
    `Pedido: *#${shortRef}*`
  ].join('\n'));

  store.addMessage(phone, 'user', '[COMPROVANTE ENVIADO]');
  store.addMessage(phone, 'bot', 'Comprovante encaminhado para análise pelo grupo admin.');
}

async function handleCustomerMessage(sock, message, groupId) {
  const cfg = loadConfig();
  if (!cfg.enabled) return;

  const jid   = message.key.remoteJid;
  const phone = phoneKey(jid);
  if (!phone) return;

  // Allowlist check
  if (cfg.mode === 'allowlist') {
    const allowed = (cfg.allowedTestPhones || []).map(p => String(p).replace(/\D/g, ''));
    if (!allowed.includes(phone)) return;
  }

  // Message age check
  const msgTs  = Number(message.messageTimestamp || 0) * 1000 || Date.now();
  const ageMs  = Date.now() - msgTs;
  const maxAge = (cfg.ignoreMessagesOlderThanSeconds || 60) * 1000;
  if (ageMs > maxAge) { logger.info('Msg ignorada (muito antiga)', { phone, ageMs }); return; }

  const msgContent = message.message || {};
  const text = (
    msgContent.conversation ||
    msgContent.extendedTextMessage?.text ||
    msgContent.imageMessage?.caption ||
    msgContent.documentMessage?.caption ||
    msgContent.videoMessage?.caption || ''
  ).trim();

  const msgId    = message.key.id;
  const mediaType = ['imageMessage', 'documentMessage', 'videoMessage'].find(t => msgContent[t]);

  // Duplicate guard
  if (store.isProcessed(phone, msgId)) return;
  store.markProcessed(phone, msgId);

  // Rate limit
  if (store.isRateLimited(phone, cfg.maxRepliesPerMinute || 6)) {
    logger.warn('Rate limit atingido', { phone }); return;
  }

  // Occasional cleanup
  if (Math.random() < 0.01) store.purgeOld(cfg.conversationTtlDays || 30);

  logger.info('Msg recebida', { phone, text: text.substring(0, 50), mediaType });

  // Sensitive data in text
  if (text && sanitizer.hasSensitiveData(text)) {
    await send(sock, jid, sanitizer.SAFETY_WARNING);
    store.addMessage(phone, 'user', '[DADOS SENSÍVEIS OCULTADOS]');
    store.addMessage(phone, 'bot', sanitizer.SAFETY_WARNING);
    return;
  }

  // Media (image/document) → proof flow
  if (mediaType) {
    await handleProof(sock, message, phone, jid, msgContent, mediaType, groupId);
    return;
  }

  if (!text) return;

  store.addMessage(phone, 'user', sanitizer.sanitize(text));

  const conv    = store.getConversation(phone);
  const ctx     = conv.context || {};
  const siteUrl = cfg.siteUrl || '';

  const detected = intent.detectIntent(text, ctx);
  logger.info('Intent', { phone, intent: detected.intent, query: detected.query });

  let reply    = '';
  let newCtx   = { ...ctx };

  switch (detected.intent) {

    case 'campaign_code': {
      const code     = detected.campaignCode;
      const campaigns = cfg.campaignCodes || [];
      const camp     = campaigns.find(c => String(c.code).toUpperCase() === code && c.active);
      newCtx.campaignCode   = code;
      newCtx.campaignSource = camp?.source || 'Anúncio';

      if (camp?.productId) {
        const p = catalog.getProductById(camp.productId);
        if (p) {
          newCtx.lastProductId    = p.id;
          newCtx.lastProductName  = p.name;
          newCtx.lastProductQuery = p.model || p.name;
          reply = [
            `Olá! Identifiquei seu código de anúncio *${code}*. 👋`,
            '',
            'Aqui está o produto desta oferta:',
            '',
            productCard(p, siteUrl),
            '',
            'Para garantir a disponibilidade, finalize pelo site. Posso ajudar com mais alguma informação?',
          ].join('\n');
          break;
        }
      }
      reply = [
        `Olá! Identifiquei seu código *${code}*. 👋`,
        '',
        'Acesse nosso catálogo no site para ver os produtos desta oferta.',
        '',
        'Está procurando algum modelo específico?',
      ].join('\n');
      break;
    }

    case 'greeting':
      reply = [
        'Olá! 👋 Seja bem-vindo(a)!',
        '',
        'Sou o assistente virtual da loja. Posso te ajudar com:',
        '• Buscar produtos no catálogo',
        '• Verificar disponibilidade e preços',
        '• Enviar o link do produto',
        '• Consultar status do seu pedido',
        '',
        'Qual modelo você está procurando?',
      ].join('\n');
      break;

    case 'select_product': {
      const idx  = parseInt(detected.query, 10) - 1;
      const list = ctx.lastProductList || [];
      if (!list.length) {
        reply = 'Me diga o modelo que você procura e te mostro as opções disponíveis.';
        break;
      }
      if (idx < 0 || idx >= list.length) {
        reply = `Escolha um número entre 1 e ${list.length}.`;
        break;
      }
      const p = catalog.getProductById(list[idx].id);
      if (!p) {
        reply = 'Produto não encontrado. Me diga o modelo e busco novamente.';
        break;
      }
      newCtx.lastProductId    = p.id;
      newCtx.lastProductName  = p.name;
      newCtx.lastProductQuery = ctx.lastProductQuery;
      reply = [
        'Aqui estão os detalhes:',
        '',
        productCard(p, siteUrl),
        '',
        'Posso mostrar variações de cor/memória, opções mais baratas ou enviar o link para finalizar a compra.',
      ].join('\n');
      break;
    }

    case 'search_product': {
      const results = catalog.searchProducts(detected.query || text, { limit: 3 });
      if (results.length === 0) {
        reply = [
          `Não encontrei *"${detected.query || text}"* no catálogo no momento.`,
          '',
          'Tente descrever de outra forma ou acesse o catálogo completo no site.',
        ].join('\n');
        break;
      }
      const first = results[0];
      newCtx.lastProductId    = first.id;
      newCtx.lastProductName  = first.name;
      newCtx.lastProductQuery = detected.query;
      // Salva a lista para permitir seleção por número (1, 2, 3)
      newCtx.lastProductList  = results.map(p => ({ id: p.id, name: p.name }));

      if (results.length === 1) {
        reply = [
          'Encontrei este produto:',
          '',
          productCard(first, siteUrl),
          '',
          'Posso te enviar mais opções de cor/memória ou ajudar a finalizar a compra.',
        ].join('\n');
      } else {
        reply = [
          `Encontrei *${results.length}* produtos no catálogo:`,
          '',
          ...results.map((p, i) => {
            const avail = p.stock > 0 ? '✅' : '⛔';
            const price = p.price > 0 ? fmt(p.price) : 'Consulte no site';
            return `${i + 1}. ${avail} *${p.name}*\n   💰 ${price}\n   🔗 ${siteUrl}/product?id=${p.id}`;
          }),
          '',
          'Responda com *1*, *2* ou *3* para ver os detalhes do produto.',
        ].join('\n');
      }
      break;
    }

    case 'ask_price': {
      let p = ctx.lastProductId ? catalog.getProductById(ctx.lastProductId) : null;
      if (!p && detected.query) p = catalog.searchProducts(detected.query, { limit: 1 })[0] || null;
      if (!p) {
        reply = 'Qual modelo você gostaria de consultar o preço?';
        break;
      }
      newCtx.lastProductId    = p.id;
      newCtx.lastProductName  = p.name;
      newCtx.lastProductQuery = detected.query || ctx.lastProductQuery;
      const lines = [`*${p.name}*`, ''];
      if (p.priceOriginal && p.priceOriginal > p.price) {
        lines.push(`💰 De: ${fmt(p.priceOriginal)}`);
        lines.push(`💰 Por: *${fmt(p.price)}*`);
      } else {
        lines.push(`💰 Preço atual: *${fmt(p.price)}*`);
      }
      lines.push('', `🔗 ${siteUrl}/product?id=${p.id}`, '', 'Gostaria do link para finalizar a compra?');
      reply = lines.join('\n');
      break;
    }

    case 'ask_pix':
      reply = [
        'As condições de PIX são confirmadas no checkout no momento da compra.',
        '',
        ctx.lastProductId
          ? `Posso te enviar o link do produto:\n🔗 ${siteUrl}/product?id=${ctx.lastProductId}`
          : 'Qual produto você gostaria de consultar?',
      ].join('\n');
      break;

    case 'ask_installments':
      reply = [
        'As condições de parcelamento são confirmadas no checkout.',
        '',
        ctx.lastProductId
          ? `Posso te enviar o link para finalizar a compra:\n🔗 ${siteUrl}/product?id=${ctx.lastProductId}`
          : 'Qual produto você deseja comprar?',
      ].join('\n');
      break;

    case 'ask_gift':
      reply = [
        'Os brindes disponíveis são confirmados no checkout e na oferta ativa do produto.',
        '',
        ctx.lastProductId
          ? `Posso te enviar o link com a oferta atualizada:\n🔗 ${siteUrl}/product?id=${ctx.lastProductId}`
          : 'Qual produto você tem interesse?',
      ].join('\n');
      break;

    case 'ask_color': {
      let p = ctx.lastProductId ? catalog.getProductById(ctx.lastProductId) : null;
      if (!p && detected.query) p = catalog.searchProducts(detected.query, { limit: 1 })[0] || null;
      if (!p) { reply = 'Qual modelo você deseja consultar as cores disponíveis?'; break; }
      newCtx.lastProductId    = p.id;
      newCtx.lastProductName  = p.name;
      newCtx.lastProductQuery = detected.query || ctx.lastProductQuery;
      const siblings = catalog.getSiblings(p);
      const colors   = [...new Set([p.color, ...siblings.map(s => s.color)].filter(Boolean))];
      if (colors.length <= 1) {
        reply = [`*${p.name}*`, `🎨 Cor: ${p.color || 'Consulte no site'}`, `🔗 ${siteUrl}/product?id=${p.id}`].join('\n');
      } else {
        reply = [
          `*${p.model || p.name}* — Cores disponíveis:`,
          '',
          ...colors.map(c => `• ${c}`),
          '',
          `Veja todos os modelos e variações:\n🔗 ${siteUrl}/product?id=${p.id}`,
        ].join('\n');
      }
      break;
    }

    case 'ask_storage': {
      let p = ctx.lastProductId ? catalog.getProductById(ctx.lastProductId) : null;
      if (!p && detected.query) p = catalog.searchProducts(detected.query, { limit: 1 })[0] || null;
      if (!p) { reply = 'Qual modelo você deseja consultar as opções de memória?'; break; }
      newCtx.lastProductId    = p.id;
      newCtx.lastProductName  = p.name;
      newCtx.lastProductQuery = detected.query || ctx.lastProductQuery;
      const siblings = catalog.getSiblings(p);
      const storages = [...new Set([p.storage, ...siblings.map(s => s.storage)].filter(Boolean))];
      if (storages.length <= 1) {
        reply = [`*${p.name}*`, `💾 Armazenamento: ${p.storage || 'Consulte no site'}`, `🔗 ${siteUrl}/product?id=${p.id}`].join('\n');
      } else {
        reply = [
          `*${p.model || p.name}* — Armazenamentos disponíveis:`,
          '',
          ...storages.map(s => `• ${s}`),
          '',
          `Veja todos os modelos:\n🔗 ${siteUrl}/product?id=${p.id}`,
        ].join('\n');
      }
      break;
    }

    case 'ask_availability': {
      let p = ctx.lastProductId ? catalog.getProductById(ctx.lastProductId) : null;
      if (!p && detected.query) p = catalog.searchProducts(detected.query, { limit: 1 })[0] || null;
      if (!p) {
        reply = [`Não encontrei *"${detected.query || 'o produto'}"* no catálogo.`, '', 'Pode tentar com um nome ou modelo diferente?'].join('\n');
        break;
      }
      newCtx.lastProductId    = p.id;
      newCtx.lastProductName  = p.name;
      newCtx.lastProductQuery = detected.query || ctx.lastProductQuery;
      if (p.stock > 0) {
        reply = [
          `*${p.name}*`, '',
          '✅ Esse modelo aparece disponível no catálogo neste momento.',
          'Para garantir, acesse o link e finalize pelo site.',
          '', `🔗 ${siteUrl}/product?id=${p.id}`,
        ].join('\n');
      } else {
        const related = catalog.getRelated(p, { limit: 2 });
        const lines   = [`*${p.name}*`, '', '⛔ Esse modelo aparece indisponível no momento.'];
        if (related.length > 0) {
          lines.push('', 'Posso te mostrar opções semelhantes:');
          related.forEach(r => lines.push(`• *${r.name}* — ${fmt(r.price)}\n  🔗 ${siteUrl}/product?id=${r.id}`));
        }
        reply = lines.join('\n');
      }
      break;
    }

    case 'buy_intent': {
      if (!ctx.lastProductId) { reply = 'Qual produto você deseja comprar? Me diga o modelo e te envio o link.'; break; }
      const p = catalog.getProductById(ctx.lastProductId);
      if (!p) { reply = 'Não encontrei o produto no catálogo. Pode me dizer o modelo?'; break; }
      reply = [
        `*${p.name}*`, '',
        '🛒 Para finalizar sua compra:',
        `🔗 ${siteUrl}/product?id=${p.id}`,
        '',
        'No site você escolhe a forma de pagamento e informa o endereço de entrega.',
      ].join('\n');
      break;
    }

    case 'cheaper_option': {
      if (!ctx.lastProductId) { reply = 'Qual produto você quer comparar? Me diga o modelo atual.'; break; }
      const p = catalog.getProductById(ctx.lastProductId);
      if (!p) break;
      const cheaper = catalog.getCheaperThan(p, { limit: 3 });
      if (cheaper.length === 0) {
        reply = ['Não encontrei opções com preço menor no catálogo.', '', `Produto atual:\n${productCard(p, siteUrl)}`].join('\n');
        break;
      }
      reply = [
        'Opções com preço menor:',
        '',
        ...cheaper.map(r => `• *${r.name}*\n  💰 ${fmt(r.price)}\n  🔗 ${siteUrl}/product?id=${r.id}`),
      ].join('\n');
      break;
    }

    case 'similar_products': {
      let p = ctx.lastProductId ? catalog.getProductById(ctx.lastProductId) : null;
      if (!p && detected.query) p = catalog.searchProducts(detected.query, { limit: 1 })[0] || null;
      if (!p) { reply = 'Qual modelo você quer comparar? Me diga o produto atual.'; break; }
      const related = catalog.getRelated(p, { limit: 3 });
      if (related.length === 0) {
        reply = ['Não encontrei modelos semelhantes no catálogo no momento.', '', `Produto atual:\n${productCard(p, siteUrl)}`].join('\n');
        break;
      }
      reply = [
        'Modelos semelhantes disponíveis:',
        '',
        ...related.map(r => `• *${r.name}*\n  💰 ${fmt(r.price)}\n  🔗 ${siteUrl}/product?id=${r.id}`),
      ].join('\n');
      break;
    }

    case 'ask_order_status': {
      const payments     = loadPayments();
      const specificId   = detected.query; // PED12345 or null
      let clientOrders;
      if (specificId) {
        const o = payments.find(p => (p.shortId || '').toUpperCase() === specificId.toUpperCase());
        clientOrders = o ? [o] : [];
      } else {
        clientOrders = payments.filter(p => String(p.clientPhone || '').replace(/\D/g, '') === phone);
      }

      if (clientOrders.length === 0) {
        reply = [
          specificId
            ? `Não encontrei o pedido *${specificId}*. Verifique o código e tente novamente.`
            : 'Não encontrei pedidos associados a este número.',
          '',
          'Se a compra foi feita com outro número, consulte "Meus Pedidos" no site.',
        ].join('\n');
        break;
      }

      const STATUS = {
        pending:             '⏳ Aguardando pagamento',
        awaiting_validation: '🔍 Comprovante em análise',
        paid:                '✅ Pagamento confirmado',
        refused:             '❌ Recusado',
      };

      const recent = [...clientOrders]
        .sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1)
        .slice(0, 3);

      const lines = ['Seus pedidos:'];
      recent.forEach(o => {
        lines.push('');
        lines.push(`📋 *#${o.shortId || o.id.slice(0, 8)}*`);
        lines.push(`🛍️ ${o.productName || 'Produto'}`);
        lines.push(`💰 ${fmt(o.amount)}`);
        lines.push(`Status: ${STATUS[o.status] || o.status}`);
        if (o.status === 'paid' && o.paidAt) lines.push(`✅ Confirmado em ${new Date(o.paidAt).toLocaleDateString('pt-BR')}`);
        if (o.status === 'refused' && o.refuseReason) lines.push(`❌ Motivo: ${o.refuseReason}`);
      });
      lines.push('', 'Para detalhes completos, acesse "Meus Pedidos" no site.');
      reply = lines.join('\n');
      break;
    }

    case 'proof_of_payment':
      reply = [
        'Para enviar seu comprovante, envie a *imagem* diretamente nesta conversa.',
        '',
        'Nossa equipe será notificada e analisará o pagamento.',
      ].join('\n');
      break;

    default:
      reply = [
        'Olá! Posso te ajudar com:',
        '• Buscar produtos no catálogo',
        '• Ver preços e verificar disponibilidade',
        '• Enviar link do produto',
        '• Consultar status do seu pedido',
        '',
        'Qual modelo de produto você está procurando?',
      ].join('\n');
      break;
  }

  if (reply) {
    await send(sock, jid, reply);
    store.addMessage(phone, 'bot', reply);
  }

  store.updateConversation(phone, { context: newCtx, state: 'browsing' });
}

module.exports = { handleCustomerMessage };
