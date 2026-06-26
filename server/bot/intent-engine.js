'use strict';

function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function has(text, ...terms) {
  const n = norm(text);
  return terms.some(t => n.includes(norm(t)));
}

function extractCampaignCode(text) {
  const m = text.match(/\b(AD-[A-Z0-9]+)\b/i);
  return m ? m[1].toUpperCase() : null;
}

function extractOrderShortId(text) {
  const m = text.match(/\b(PED\d{5})\b/i);
  return m ? m[1].toUpperCase() : null;
}

function extractProductQuery(text) {
  const FILLER = ['tem', 'quero', 'preciso', 'busco', 'procuro', 'ver', 'qual', 'quais', 'me', 'o',
    'a', 'de', 'do', 'da', 'um', 'uma', 'oi', 'ola', 'olá', 'bom', 'dia', 'tarde', 'noite',
    'voce', 'você', 'pra', 'para', 'com', 'tem', 'ai', 'aí', 'la', 'lá', 'e', 'é', 'mas'];
  const words = norm(text).split(' ').filter(w => w.length > 1 && !FILLER.includes(w));
  return words.join(' ').trim();
}

function detectIntent(text, context = {}) {
  if (!text) return { intent: 'unknown', confidence: 'low', query: null };
  const n = norm(text);

  // ── Código de campanha ─────────────────────────────────────────────────────
  const campaignCode = extractCampaignCode(text);
  if (campaignCode) return { intent: 'campaign_code', confidence: 'high', query: null, campaignCode };

  // ── Referência explícita de pedido (PED12345) ──────────────────────────────
  const shortId = extractOrderShortId(text);
  if (shortId) return { intent: 'ask_order_status', confidence: 'high', query: shortId };

  // ── Status do pedido ───────────────────────────────────────────────────────
  if (has(n, 'pedido', 'meu pedido', 'onde esta', 'onde está', 'entrega', 'rastreio',
    'rastreamento', 'encomenda', 'quando chega', 'chegou', 'status do', 'minha compra', 'recebi')) {
    return { intent: 'ask_order_status', confidence: 'high', query: null };
  }

  // ── Comprovante / prova de pagamento ──────────────────────────────────────
  if (has(n, 'comprovante', 'paguei', 'ja paguei', 'já paguei', 'transferencia', 'transferência',
    'enviei o pix', 'enviei pix', 'mandei o pix', 'fiz o pix', 'pix feito', 'enviei o comprovante')) {
    return { intent: 'proof_of_payment', confidence: 'high', query: null };
  }

  // ── Saudação (somente mensagens curtas sem produto) ────────────────────────
  const isGreeting = has(n, 'oi', 'olá', 'ola', 'hey', 'bom dia', 'boa tarde', 'boa noite',
    'hello', 'hi', 'tudo bem', 'boas', 'boa');
  if (isGreeting && n.split(' ').length <= 4) {
    return { intent: 'greeting', confidence: 'high', query: null };
  }

  // ── Seleção de item da lista (1, 2 ou 3 após lista de produtos) ───────────
  if (/^[1-3]$/.test(text.trim())) {
    return { intent: 'select_product', confidence: 'high', query: text.trim() };
  }

  // ── PIX / pagamento à vista ────────────────────────────────────────────────
  if (has(n, 'pix', 'a vista', 'à vista', 'avista', 'desconto pix', 'preco pix', 'preço pix',
    'valor pix', 'tem desconto no pix', 'pix tem desconto')) {
    const q = extractProductQuery(text);
    return { intent: 'ask_pix', confidence: 'high', query: q || context.lastProductQuery || null };
  }

  // ── Parcelamento / cartão ──────────────────────────────────────────────────
  if (has(n, 'parcela', 'parcelado', 'parcelar', 'credito', 'crédito', 'cartao', 'cartão',
    'juros', 'vezes', '12x', '10x', '6x', '3x', 'sem juros', 'parcelamento')) {
    return { intent: 'ask_installments', confidence: 'high', query: context.lastProductQuery || null };
  }

  // ── Brinde / acessórios inclusos ──────────────────────────────────────────
  if (has(n, 'brinde', 'brindes', 'ganho', 'ganhar', 'acompanha', 'vem com', 'incluso',
    'inclui', 'na caixa', 'airpod', 'fone', 'capa', 'película', 'pelicula', 'carregador junto')) {
    return { intent: 'ask_gift', confidence: 'high', query: context.lastProductQuery || null };
  }

  // ── Intenção de compra / link ──────────────────────────────────────────────
  if (has(n, 'quero comprar', 'quero esse', 'quero este', 'finalizar', 'checkout',
    'me manda o link', 'me envia o link', 'link do produto', 'como compro', 'como faço para comprar',
    'quero o link', 'site')) {
    return { intent: 'buy_intent', confidence: 'high', query: context.lastProductQuery || null };
  }

  // ── Opção mais barata ──────────────────────────────────────────────────────
  if (has(n, 'mais barato', 'mais em conta', 'menor preço', 'menor preco', 'opção mais barata',
    'tem algo mais barato', 'tem algum mais barato', 'mais acessivel', 'mais acessível')) {
    return { intent: 'cheaper_option', confidence: 'high', query: context.lastProductQuery || null };
  }

  // ── Disponibilidade ────────────────────────────────────────────────────────
  if (has(n, 'tem estoque', 'tem disponivel', 'tem disponível', 'disponivel', 'disponível',
    'acabou', 'esgotado', 'ainda tem', 'tem ainda', 'em estoque')) {
    const q = extractProductQuery(text);
    return { intent: 'ask_availability', confidence: 'high', query: q || context.lastProductQuery || null };
  }

  // ── Cor ───────────────────────────────────────────────────────────────────
  if (has(n, 'cor', 'cores', 'azul', 'preto', 'branco', 'vermelho', 'verde', 'dourado',
    'roxo', 'cinza', 'amarelo', 'laranja', 'titanio', 'titânio', 'champagne', 'meia noite',
    'estelar', 'midnight', 'starlight', 'rosa', 'lilás', 'lilas', 'grafite', 'silver',
    'quais cores', 'tem em')) {
    const q = extractProductQuery(text);
    return { intent: 'ask_color', confidence: 'high', query: q || context.lastProductQuery || null };
  }

  // ── Memória / armazenamento ────────────────────────────────────────────────
  if (has(n, 'memoria', 'memória', ' gb', 'giga', 'armazenamento', '128', '256', '512',
    '64gb', '128gb', '256gb', '512gb', '1tb', '1 tb', 'quanto de memoria', 'quanto de memória')) {
    const q = extractProductQuery(text);
    return { intent: 'ask_storage', confidence: 'high', query: q || context.lastProductQuery || null };
  }

  // ── Preço ─────────────────────────────────────────────────────────────────
  if (has(n, 'preço', 'preco', 'quanto', 'valor', 'custa', 'custo', 'quanto fica',
    'qual o preço', 'qual o valor', 'quanto ta', 'quanto está')) {
    const q = extractProductQuery(text);
    return { intent: 'ask_price', confidence: 'high', query: q || context.lastProductQuery || null };
  }

  // ── Busca por marca/modelo conhecida (ANTES de similar_products) ──────────
  // Garante que "iphone 17 pro max" seja busca, não "modelo semelhante"
  if (has(n, 'iphone', 'samsung', 'xiaomi', 'motorola', 'console', 'playstation', 'ps4', 'ps5',
    'xbox', 'airpod', 'apple watch', 'macbook', 'notebook', 'ipad', 'android', 'realme',
    'redmi', 'galaxy', 'tab', 'smartwatch', 'relogio', 'relógio')) {
    const q = extractProductQuery(text);
    return { intent: 'search_product', confidence: 'high', query: q || text };
  }

  // ── Produto semelhante / superior ─────────────────────────────────────────
  // 'pro max' removido — faz parte de nome de produto, não de pedido de similaridade
  if (has(n, 'semelhante', 'similar', 'parecido', 'outro modelo', 'outra opção', 'melhor modelo',
    'superior', 'top de linha', 'melhor que', 'alternativa')) {
    return { intent: 'similar_products', confidence: 'high', query: context.lastProductQuery || null };
  }

  // ── Busca genérica com palavras de intenção ────────────────────────────────
  if (has(n, 'tem ', 'procuro ', 'busco ', 'quero ver ', 'tem algum', 'tem alguma', 'voce tem', 'vocês tem')) {
    const q = extractProductQuery(text);
    if (q && q.length >= 3) {
      return { intent: 'search_product', confidence: 'medium', query: q };
    }
  }

  return { intent: 'unknown', confidence: 'low', query: null };
}

module.exports = { detectIntent, extractCampaignCode, extractOrderShortId, extractProductQuery };
