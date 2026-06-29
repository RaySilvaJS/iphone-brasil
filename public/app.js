// ===== ÍCONES SVG (Lucide-style) para uso nos cards =====
const ICONS = {
  gift: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
  truck: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  lock: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  zap: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  mapPin: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  heartFilled: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#e53e3e" stroke="#e53e3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  smartphone: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
};

const productsGrid = document.getElementById("products-grid");
const filterModel = document.getElementById("filter-model");
const filterCondition = document.getElementById("filter-condition");
const filterColor = document.getElementById("filter-color");
const filterMaxPrice = document.getElementById("filter-max-price");
const applyFilterButton = document.getElementById("apply-filter");
const resetFilterButton = document.getElementById("reset-filter");
const chatWidget = document.getElementById("chat-widget");
const chatClose = document.getElementById("chat-close");
const chatOptions = document.querySelectorAll(".chat-option");
const categoryButtons = document.querySelectorAll(".categories .cat-item");

const buildProductUrl = (productId) => `/product.html?id=${encodeURIComponent(productId)}`;

let currentProducts = [];
let gallerySwiper = null;

// ===== CATÁLOGOS POR CATEGORIA =====
const CATALOGS = {
  iphones:      '/data/iphones.json',
  android:      '/data/androids.json',
  consoles:     '/data/consoles.json',
  smartwatches: '/data/smartwatches.json',
  acessorios:   '/data/acessorios.json',
  informatica:  '/data/informatica.json',
  suplementos:  '/data/suplementos.json'
};

const CATALOG_LABELS = {
  iphones:      'iPhones',
  android:      'Android',
  consoles:     'Consoles',
  smartwatches: 'Smartwatches',
  acessorios:   'Acessórios',
  informatica:  'Informática',
  suplementos:  'Suplementos'
};

const productCache = {};
const catalogCache = {};
const catalogPromises = {}; // deduplicação: evita 2 fetches simultâneos do mesmo catálogo

// ===== MODO DE DIAGNÓSTICO (?debugProdutos=1) =====
const _debugEnabled = /[?&]debugProdutos=1/.test(location.search);
const _debugEntries = [];
function _debugLog(entry) {
  if (!_debugEnabled) return;
  _debugEntries.push({ ms: Date.now(), ...entry });
  _renderDebugPanel();
}
function _renderDebugPanel() {
  const el = document.getElementById('_dbg_panel_body');
  if (!el) return;
  el.innerHTML = _debugEntries.map(e => {
    const t = `[+${e.ms - _debugEntries[0].ms}ms] `;
    if (e.type === 'fetch')       return `${t}<b style="color:#4af">FETCH</b> ${e.url}<br>&nbsp;&nbsp;HTTP ${e.status} ${e.ok ? '✅' : '❌'} | ${e.ct || 'sem content-type'}`;
    if (e.type === 'fetch-error') return `${t}<b style="color:#f55">ERRO</b> ${e.error} | url: ${e.url}`;
    if (e.type === 'fail')        return `${t}<b style="color:#f88">FALHA</b> ${e.key}: 2 tentativas falharam`;
    if (e.type === 'loaded')      return `${t}<b style="color:#4f4">OK</b> ${e.key}: ${e.count} produtos`;
    if (e.type === 'render')      return `${t}<b style="color:#ff4">RENDER</b> ${e.count} cards`;
    if (e.type === 'card-error')  return `${t}<b style="color:#f55">CARD ERR</b> id=${e.id}: ${e.error}`;
    if (e.type === 'catch')       return `${t}<b style="color:#f55">CATCH</b> ${e.name}: ${e.message}`;
    return `${t}${JSON.stringify(e)}`;
  }).join('<br>') + `<br><br><b style="color:#ff0">UA:</b> ${navigator.userAgent.replace(/;/g,' |')}`;
}
function _initDebugPanel() {
  if (!_debugEnabled) return;
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;background:rgba(0,0,0,.92);color:#0f0;font:11px/1.6 monospace;padding:12px 14px;border-radius:10px;max-width:min(94vw,520px);max-height:80vh;overflow-y:auto;box-shadow:0 4px 32px rgba(0,0,0,.6)';
  p.innerHTML = '<b style="color:#ff0;font-size:13px">🔍 Debug Produtos</b> <small style="color:#aaa">(remove ?debugProdutos=1 para ocultar)</small><br><br><span id="_dbg_panel_body">Inicializando…</span>';
  document.body.appendChild(p);
}

// ===== CACHE DE FAVORITOS — lê localStorage UMA vez, não por card =====
let _favsCache = null;
const _getFavs = () => {
  if (_favsCache === null) {
    try { _favsCache = JSON.parse(localStorage.getItem("favorites") || "[]"); } catch(e) { _favsCache = []; }
  }
  return _favsCache;
};

const isValidProductImage = (s) => typeof s === 'string' && s.length > 4 && (s.startsWith('http') || s.startsWith('/uploads/'));

// Retorna a primeira imagem oficial do produto — sem console.log para não travar o render
const getFirstValidImage = (product) => {
  return (product.images || []).find(isValidProductImage) || '';
};

// ===== POPULATION DO productCache EM IDLE TIME =====
// Evita bloquear a thread principal ao receber 25.000 produtos
const _scheduleProductCachePopulation = (products) => {
  if ('requestIdleCallback' in window) {
    let i = 0;
    const run = (deadline) => {
      // didTimeout: forçado pelo browser após o timeout — processa mesmo sem idle time
      while (i < products.length && (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
        productCache[String(products[i].id)] = products[i];
        i++;
      }
      if (i < products.length) requestIdleCallback(run, { timeout: 3000 });
    };
    requestIdleCallback(run, { timeout: 3000 });
  } else {
    // Fallback: batches de 1000 com setTimeout para ceder ao browser entre batches
    const BATCH = 1000;
    let i = 0;
    const run = () => {
      const end = Math.min(i + BATCH, products.length);
      for (; i < end; i++) productCache[String(products[i].id)] = products[i];
      if (i < products.length) setTimeout(run, 0);
    };
    setTimeout(run, 0);
  }
};

// Executa um único fetch com timeout opcional (AbortController) e retorna
// o array de produtos ou null em caso de erro. Compatível com Safari iOS 11+.
const _doFetch = async (url, attempt) => {
  // AbortController não existe em Safari iOS < 11.3 — usar feature detection
  let controller = null;
  let timeoutId  = null;
  if (typeof AbortController !== 'undefined') {
    controller = new AbortController();
    timeoutId  = setTimeout(() => {
      controller.abort();
      console.warn(`[FETCH TIMEOUT] ${url} tentativa ${attempt} — abortado após 45s`);
    }, 45000);
  }
  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : {});
    if (timeoutId) clearTimeout(timeoutId);
    const ct = (res.headers.get('content-type') || '');
    _debugLog({ type: 'fetch', url, status: res.status, ok: res.ok, ct, attempt });
    if (!res.ok) {
      console.warn(`[FETCH] ${url}: HTTP ${res.status} | content-type: ${ct}`);
      return null;
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    _debugLog({ type: 'fetch-error', url, error: err.name + ': ' + (err.message || ''), attempt });
    console.error(`[FETCH ERROR] ${url} tentativa ${attempt}:`, err.name, err.message || String(err));
    return null;
  }
};

const loadCatalog = async (key) => {
  if (catalogCache[key]) {
    console.log(`[CACHE HIT] ${key}: ${catalogCache[key].length} produtos em memória`);
    return catalogCache[key];
  }
  // Deduplicação: retorna a promise existente se o fetch já está em andamento
  if (catalogPromises[key]) {
    console.log(`[DEDUP] ${key}: aguardando fetch já em andamento`);
    return catalogPromises[key];
  }

  const promise = (async () => {
    try {
      const url = CATALOGS[key];
      let products = await _doFetch(url, 1);

      // Única retry automática após falha (rede móvel instável)
      if (products === null) {
        console.log(`[FETCH RETRY] ${key}: nova tentativa em 1.5s...`);
        await new Promise(r => setTimeout(r, 1500));
        products = await _doFetch(url, 2);
      }

      if (products === null) {
        console.error(`[FETCH FAIL] ${key}: falha após 2 tentativas — retornando vazio`);
        _debugLog({ type: 'fail', key });
        return [];
      }

      catalogCache[key] = products;
      _scheduleProductCachePopulation(products);
      _debugLog({ type: 'loaded', key, count: products.length });
      console.log(`[FETCH] ${key}: ${products.length} produtos carregados`);
      return products;
    } finally {
      delete catalogPromises[key];
    }
  })();

  catalogPromises[key] = promise;
  return promise;
};

const getCurrentCatalogKey = () => {
  const active = document.querySelector('.categories .cat-item.active');
  return active?.dataset.catalog || 'iphones';
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
window.formatCurrency = formatCurrency;

// ===== PAGINAÇÃO REAL =====
const PRODUCTS_PER_PAGE = 12;
let currentPage = 1;
let isLoadingMore = false;
let ioAutoLoadCount = 0;
let _suppressURLUpdate = false; // evita pushState durante popstate

const updateLoadMoreBtn = (total, loaded) => { /* legado — não usado com paginação real */ };

// ===== URL ROUTING =====
function _parseURL() {
  const path   = location.pathname;
  const params = new URLSearchParams(location.search);
  if (path.startsWith('/busca')) {
    return { mode: 'search', termo: params.get('termo') || '', pagina: Math.max(1, parseInt(params.get('pagina')) || 1) };
  }
  const m   = path.match(/\/catalogo\/([a-z]+)/);
  const key = (m && CATALOGS[m[1]]) ? m[1] : 'iphones';
  return { mode: 'catalog', catalogKey: key, pagina: Math.max(1, parseInt(params.get('pagina')) || 1) };
}

function _pushURL(mode, params) {
  if (_suppressURLUpdate) return;
  let url;
  if (mode === 'search') {
    url = '/busca?termo=' + encodeURIComponent(params.termo) + '&pagina=' + params.pagina;
  } else {
    url = '/catalogo/' + params.catalogKey + '?pagina=' + params.pagina;
  }
  if (location.href !== location.origin + url) {
    history.pushState({ mode, ...params }, '', url);
  }
}

// ===== RENDERIZAÇÃO DE PAGINAÇÃO =====
function _renderPagination(currentPg, totalPages) {
  const wrapper   = document.getElementById('pagination-wrapper');
  const container = document.getElementById('pagination');
  if (!wrapper || !container) return;

  if (totalPages <= 1) { wrapper.style.display = 'none'; return; }
  wrapper.style.display = '';

  const rangeStart = Math.max(1, currentPg - 2);
  const rangeEnd   = Math.min(totalPages, currentPg + 2);
  let html = '';

  if (currentPg > 1) {
    html += `<button class="pg-btn pg-nav" data-page="${currentPg - 1}" aria-label="Página anterior">← Anterior</button>`;
  }

  if (rangeStart > 1) {
    html += `<button class="pg-btn" data-page="1" aria-label="Página 1">1</button>`;
    if (rangeStart > 2) html += `<span class="pg-btn" style="border:none;background:none;cursor:default;min-width:24px;">…</span>`;
  }
  for (let p = rangeStart; p <= rangeEnd; p++) {
    html += `<button class="pg-btn${p === currentPg ? ' active' : ''}" data-page="${p}" aria-label="Página ${p}"${p === currentPg ? ' aria-current="page"' : ''}>${p}</button>`;
  }
  if (rangeEnd < totalPages) {
    if (rangeEnd < totalPages - 1) html += `<span class="pg-btn" style="border:none;background:none;cursor:default;min-width:24px;">…</span>`;
    html += `<button class="pg-btn" data-page="${totalPages}" aria-label="Página ${totalPages}">${totalPages}</button>`;
  }

  if (currentPg < totalPages) {
    html += `<button class="pg-btn pg-nav" data-page="${currentPg + 1}" aria-label="Próxima página">Próxima →</button>`;
  }

  container.innerHTML = html;
  container.querySelectorAll('.pg-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p) fetchProducts(p);
    });
  });
}

function getBadges(product) {
  if (product.isNew) return '<div class="badge purple">Novo</div>';
  if (product.isPromo)
    return `<div class="badge green">-${product.promoPercent}%</div>`;
  return '<div class="badge green">Destaque</div>';
}

function getRating(rating, reviews) {
  const fullStars = Math.max(0, Math.min(5, Math.round(rating || 5)));
  return `${'★'.repeat(fullStars)}${'☆'.repeat(5 - fullStars)} <span>${rating?.toFixed(1) || '5.0'}</span>`;
}

function getPromotionText(product) {
  const promotions = [
    `${ICONS.gift} Ganhe AirPods na compra`,
    `${ICONS.truck} Envio grátis`,
    `${ICONS.lock} Garantia de 12 meses`,
    `${ICONS.zap} Entrega rápida`,
  ];

  if (product.isPromo) return promotions[0];
  if (product.isNew) return promotions[3];
  const index = product.id ? product.id.toString().length % promotions.length : 0;
  return promotions[index];
}

const parseDescriptionSections = (description) => {
  const paragraphs = description
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  const sections = {
    highlights: [],
    desempenho: [],
    cameras: [],
    tela: [],
    bateria: [],
    seguranca: [],
    conectividade: [],
    faqs: [],
  };

  let faqMode = false;
  let pendingQuestion = null;

  paragraphs.forEach((paragraph) => {
    const normalized = paragraph.toLowerCase();
    if (normalized.startsWith("perguntas frequentes")) {
      faqMode = true;
      return;
    }

    if (faqMode) {
      const lines = paragraph.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      if (lines.length >= 2) {
        sections.faqs.push({ question: lines[0], answer: lines.slice(1).join(' ') });
      } else if (pendingQuestion) {
        sections.faqs.push({ question: pendingQuestion, answer: paragraph });
        pendingQuestion = null;
      } else if (paragraph.endsWith('?')) {
        pendingQuestion = paragraph;
      }
      return;
    }

    if (
      normalized.includes('ecrã') ||
      normalized.includes('tela') ||
      normalized.includes('super retina') ||
      normalized.includes('dynamic island') ||
      normalized.includes('pro motion')
    ) {
      sections.tela.push(paragraph);
    } else if (
      normalized.includes('processador') ||
      normalized.includes('a19') ||
      normalized.includes('gpu') ||
      normalized.includes('ray tracing') ||
      normalized.includes('desempenho')
    ) {
      sections.desempenho.push(paragraph);
    } else if (
      normalized.includes('câmaras') ||
      normalized.includes('48 mp') ||
      normalized.includes('dolby vision') ||
      normalized.includes('center stage') ||
      normalized.includes('zoom')
    ) {
      sections.cameras.push(paragraph);
    } else if (normalized.includes('bateria') || normalized.includes('autonomia') || normalized.includes('horas')) {
      sections.bateria.push(paragraph);
    } else if (
      normalized.includes('sos') ||
      normalized.includes('segurança') ||
      normalized.includes('satélite') ||
      normalized.includes('acidente')
    ) {
      sections.seguranca.push(paragraph);
    } else if (
      normalized.includes('usb-c') ||
      normalized.includes('usb 3') ||
      normalized.includes('transferências') ||
      normalized.includes('conectividade')
    ) {
      sections.conectividade.push(paragraph);
    } else {
      sections.highlights.push(paragraph);
    }
  });

  return sections;
};

const buildSectionBlock = (title, icon, paragraphs) => {
  if (!paragraphs?.length) return '';
  return `
    <section class="section-block">
      <h3><i data-lucide="${icon}"></i>${title}</h3>
      ${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('')}
    </section>
  `;
};

const buildFaqBlock = (faqs) => {
  if (!faqs?.length) return '';
  return `
    <section class="section-block">
      <h3><i data-lucide="help-circle"></i>Perguntas Frequentes</h3>
      ${faqs
        .map(
          (faq) => `
            <div style="margin-bottom:1rem;">
              <p style="font-weight:700; color:#f8fafc; margin-bottom:.45rem;">${faq.question}</p>
              <p>${faq.answer}</p>
            </div>
          `,
        )
        .join('')}
    </section>
  `;
};

const buildSpecRow = (label, value) => {
  return `<dt>${label}</dt><dd>${value || '—'}</dd>`;
};

const getInstallmentInfo = (price) => {
  const installments = 3;
  const installmentValue = (price / installments).toFixed(2);
  return `em até <span class="font-bold">${installments}x de R$ ${installmentValue}</span> sem juros`;
};

const getLocationInfo = () => {
  const locations = ['São Paulo, SP', 'Rio de Janeiro, RJ', 'Belo Horizonte, MG', 'Brasília, DF', 'Salvador, BA', 'Fortaleza, CE', 'Recife, PE', 'Porto Alegre, RS'];
  return locations[Math.floor(Math.random() * locations.length)];
};

const getTimeAgo = () => {
  const times = ['Hoje, 10:30', 'Ontem, 14:20', 'Hoje, 15:45', 'Ontem, 09:15'];
  return times[Math.floor(Math.random() * times.length)];
};

// ===== BUILDER DE CARD (retorna string HTML completa — inclui wrapper <section>) =====
// Mais eficiente que createElement + innerHTML por card:
// renderProducts faz N/5 parses de HTML em vez de N parses individuais
// cardIndex: posição global na página (0-based) — primeiros 4 usam loading="eager"
const _buildProductCardHTML = (product, cardIndex = 99) => {
  const productUrl = buildProductUrl(product.id);
  const mainImage = getFirstValidImage(product);
  const seller = product.seller || "Apple Store";
  const isFav = _getFavs().includes(String(product.id));
  const extras = getOrCreateCardExtras(product.id);
  const { brinde, descontoHoje, freteGratis, stock } = extras;
  const precoOriginal = product.price;
  const precoFinal = precoOriginal * (1 - descontoHoje / 100);
  const isIphone = !!(product.name && product.name.toLowerCase().includes('iphone'));

  return `<section class="olx-adcard" data-product-id="${product.id}" data-product-url="${productUrl}"${product.featured ? ' data-featured="1"' : ''} tabindex="0">

  <div class="olx-adcard__media">

      ${isIphone ? `<div class="loja-oficial-badge">${ICONS.smartphone} LOJA OFICIAL APPLE</div>` : ''}

      <button
        type="button"
        class="olx-adcard__favorite"
        onclick="toggleFavorite('${product.id}', this)"
        aria-label="Favoritar"
        style="${isFav ? 'color:#e53e3e;background:#fff0f0;' : ''}">
        ${isFav ? ICONS.heartFilled : ICONS.heart}
      </button>

      ${mainImage
        ? `<img src="${mainImage}" alt="${cleanProductText(product.name)}" loading="${cardIndex < 4 ? 'eager' : 'lazy'}" decoding="${cardIndex < 4 ? 'sync' : 'async'}"${cardIndex < 2 ? ' fetchpriority="high"' : ''} onerror="this.onerror=null;this.style.opacity='.25';">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#F1F5F9;">${ICONS.smartphone}</div>`
      }
  </div>

  <div class="olx-adcard__content">

      <a href="${productUrl}" class="olx-adcard__link">
        <h2 class="olx-adcard__title">${cleanProductText(product.name)}</h2>
      </a>

      ${isIphone ? `<div class="desconto-hoje-badge">${ICONS.zap} Comprando HOJE: ${descontoHoje}% OFF</div>` : ''}

      <div class="olx-adcard__seller-info">
        <span class="seller-name">${seller}</span>
        ${product.rating ? `<span class="rating">${ICONS.star} ${product.rating}</span>` : ""}
      </div>

      ${isIphone ? `<div class="preco-original-wrap">
        <span class="olx-adcard__old-price">${formatCurrency(precoOriginal)}</span>
      </div>
      <h3 class="olx-adcard__price">${formatCurrency(precoFinal)}</h3>
      <div class="olx-adcard__price-info">${getInstallmentInfo(precoFinal)}</div>` : `
      <h3 class="olx-adcard__price">${formatCurrency(precoOriginal)}</h3>
      <div class="olx-adcard__price-info">${getInstallmentInfo(precoOriginal)}</div>`}

      <div class="entrega-full-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
        <span class="entrega-full-text">Entrega até no dia seguinte</span>
        <span class="entrega-full-pill">FULL</span>
      </div>

      ${isIphone ? `<div class="brinde-line">${ICONS.gift} Brinde: ${brinde}</div>` : ''}

      ${isIphone && freteGratis ? `<span class="frete-gratis-wrap">
        <span class="polylabel-pill polylabel-fw-semibold" style="color:#00A650;background-color:#E5F6ED">
          Chegará grátis sexta-feira — 1ª compra
        </span>
        <svg aria-label="Enviado pelo FULL" role="img" class="polylabel-icon" width="44" height="14" viewBox="0 0 41 13" style="--polylabel-icon-half-height:7px">
          <use href="#poly_full"></use>
        </svg>
      </span>` : ''}

      <div class="olx-adcard__location-date">
        <p class="olx-adcard__location">${ICONS.mapPin} Brasil</p>
        <p class="olx-adcard__date">Envio imediato</p>
      </div>

      <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;margin-top:4px;">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${stock <= 5 ? '#DC2626' : '#16A34A'};flex-shrink:0;"></span>
        <span style="color:${stock <= 5 ? '#DC2626' : '#475569'};">${stock <= 5 ? `Últimas ${stock} unidades!` : `${stock} unidades em estoque`}</span>
      </div>

      <div class="olx-adcard__actions">
        <button class="button button-primary" type="button" onclick="buyNow('${product.id}', this)">Comprar Agora</button>
        <button class="button button-secondary" type="button" onclick="addToCart('${product.id}', this)">Adicionar ao Carrinho</button>
      </div>

  </div>

</section>`;
};

// ===== RENDER COM RAF BATCHING =====
// Renderiza 5 cards por frame de requestAnimationFrame, evitando bloquear a thread
// principal por mais de ~5ms. Primeiros 5 cards aparecem antes do primeiro RAF.
const renderProducts = (products, onComplete) => {
  console.log('[RENDER] Iniciando render | Produtos encontrados:', products.length, '| Container:', productsGrid?.id || 'NULL');

  if (!products.length) {
    productsGrid.innerHTML = '<p class="empty-state">Nenhum produto encontrado com esses filtros.</p>';
    if (onComplete) onComplete();
    return;
  }

  if (productsGrid) {
    productsGrid.style.visibility = '';
    productsGrid.style.display = '';
    productsGrid.style.opacity = '';
  }

  ioAutoLoadCount = 0; // reset para cada nova renderização de categoria

  const BATCH = 5;
  let i = 0;

  const renderNext = () => {
    const end = Math.min(i + BATCH, products.length);
    // Guarda por card: produto com dados ruins não quebra o lote inteiro
    const batchStart = i;
    const html = products.slice(i, end).map((p, localIdx) => {
      try { return _buildProductCardHTML(p, batchStart + localIdx); }
      catch (e) {
        console.error('[CARD ERROR] id=' + p.id, e.message);
        _debugLog({ type: 'card-error', id: p.id, error: e.message });
        return '';
      }
    }).join('');

    if (i === 0) {
      productsGrid.innerHTML = html; // primeiro batch: substitui conteúdo do grid
    } else {
      productsGrid.insertAdjacentHTML('beforeend', html); // batches seguintes: adiciona ao final
    }
    i = end;

    if (i < products.length) {
      requestAnimationFrame(renderNext);
    } else {
      initImageAutoSlider();
      if (onComplete) onComplete();
    }
  };

  renderNext(); // primeiro batch sincronamente — primeiros 5 cards sem esperar RAF
};

// ===== SKELETON LOADER =====
// IMPORTANTE: nunca usar visibility:hidden no grid — em Safari iOS async functions
// podem ser suspensas em background e o hide jamais seria chamado, deixando o grid
// invisível com cards no DOM (contador funciona, tela branca).
let _skeletonTimer = null;

const showSkeleton = () => {
  const sk = document.getElementById('skeleton-loader');
  if (sk) sk.style.display = 'block'; // sobrescreve CSS display:none
  if (productsGrid) productsGrid.innerHTML = '';
  const wrapper = document.getElementById('load-more-wrapper');
  if (wrapper) wrapper.style.display = 'none';

  // Timeout de segurança: esconde o skeleton após 25s mesmo que a promise trave
  clearTimeout(_skeletonTimer);
  _skeletonTimer = setTimeout(() => {
    console.warn('[SKELETON] Timeout de segurança (25s) — forçando ocultação');
    hideSkeleton();
    if (productsGrid && productsGrid.children.length === 0) {
      productsGrid.innerHTML = '<p class="empty-state" style="color:#c53030;padding:40px 20px;text-align:center;">Conexão muito lenta. Verifique sua rede e tente novamente.</p>';
    }
  }, 25000);
};

const hideSkeleton = () => {
  clearTimeout(_skeletonTimer);
  const sk = document.getElementById('skeleton-loader');
  if (sk) sk.style.display = 'none';
  // Garante que o grid sempre esteja visível e renderizável — safety net
  if (productsGrid) {
    productsGrid.style.visibility = '';
    productsGrid.style.display = '';
    productsGrid.style.opacity = '';
  }
};

const fetchProducts = async (targetPage) => {
  const t0 = performance.now();
  const searchQuery = filterModel ? filterModel.value.trim() : '';
  const key  = getCurrentCatalogKey();
  const page = Math.max(1, targetPage || 1);

  // Atualiza URL (exceto durante popstate)
  if (searchQuery) {
    _pushURL('search', { termo: searchQuery, pagina: page });
  } else {
    _pushURL('catalog', { catalogKey: key, pagina: page });
  }

  if (!searchQuery && !catalogCache[key]) showSkeleton();

  try {
    let products;

    if (searchQuery) {
      const t1 = performance.now();
      const allCatalogs = await Promise.all(Object.keys(CATALOGS).map(loadCatalog));
      const q = searchQuery.toLowerCase();
      products = allCatalogs.flat().filter(p => (p.name || '').toLowerCase().includes(q));
      console.log(`[TIMING] busca "${searchQuery}": ${(performance.now() - t1).toFixed(0)}ms — ${products.length} resultados`);
    } else {
      const t1 = performance.now();
      products = await loadCatalog(key);
      console.log(`[TIMING] loadCatalog(${key}): ${(performance.now() - t1).toFixed(0)}ms`);
    }

    products = products.filter(p => p.price && p.price > 0);
    products.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    currentProducts = products;

    const totalPages = Math.max(1, Math.ceil(products.length / PRODUCTS_PER_PAGE));
    const safePage   = Math.max(1, Math.min(page, totalPages));
    currentPage      = safePage;

    hideSkeleton();

    if (products.length === 0) {
      if (searchQuery) {
        productsGrid.innerHTML = `<p class="empty-state" style="padding:40px 20px;text-align:center;grid-column:1/-1;">
          Não encontramos produtos para esta busca.<br>
          <button onclick="if(window.filterModel)filterModel.value='';fetchProducts(1);" style="margin-top:14px;padding:10px 22px;background:#D96B8A;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">Ver todos os produtos</button>
        </p>`;
      } else {
        productsGrid.innerHTML = '<p class="empty-state" style="padding:40px 20px;text-align:center;grid-column:1/-1;">Nenhum produto nesta categoria.</p>';
      }
      _renderPagination(1, 0);
      return;
    }

    const start = (safePage - 1) * PRODUCTS_PER_PAGE;
    const pageProducts = products.slice(start, start + PRODUCTS_PER_PAGE);

    const t2 = performance.now();
    renderProducts(pageProducts, () => {
      console.log(`[RENDER] Concluído | página ${safePage}/${totalPages} | ${pageProducts.length} cards | ${(performance.now() - t2).toFixed(0)}ms`);
      _renderPagination(safePage, totalPages);
      // Scroll para os produtos ao trocar de página (não na carga inicial)
      if (page > 1 || targetPage) {
        const grid = document.getElementById('products-grid');
        if (grid) setTimeout(() => grid.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      }
    });
  } catch (err) {
    console.error('[FETCH] Erro:', err.name, err.message);
    _debugLog({ type: 'catch', name: err.name, message: err.message || String(err) });
    hideSkeleton();
    if (productsGrid) {
      productsGrid.innerHTML = '<p class="empty-state" style="color:#c53030;padding:40px 20px;text-align:center;grid-column:1/-1;">Erro ao carregar produtos. Verifique sua conexão e tente novamente.</p>';
    }
  }
};

window.fetchProducts = fetchProducts;

const startChat = async (model, interest) => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, interest }),
  });
  const data = await response.json();
  window.open(data.url, "_blank");
};

async function getProduct(productId) {
  const id = String(productId);
  if (productCache[id]) return productCache[id];

  // Busca nos catálogos já carregados em memória (requestIdleCallback pode ainda não ter terminado)
  for (const catalogKey of Object.keys(catalogCache)) {
    const found = catalogCache[catalogKey].find(p => String(p.id) === id);
    if (found) {
      productCache[id] = found;
      return found;
    }
  }

  // Fallback para API (produtos não encontrados nos catálogos em memória)
  try {
    const res = await fetch(`/api/products/${productId}`);
    if (res.ok) {
      const p = await res.json();
      productCache[id] = p;
      return p;
    }
  } catch {}
  return null;
}

async function addToCart(productId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Adicionando...'; }
  try {
    const product = await getProduct(productId);
    if (product) {
      const extras = getOrCreateCardExtras(productId);
      product.descontoHoje = extras.descontoHoje;
      product.brinde = extras.brinde;
      product.freteGratis = extras.freteGratis;
      window.cart.addItem(product, 1);
      fetch('/api/events/cart-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: product.nome, productId: product.id, price: product.preco, quantity: 1 })
      }).catch(() => {});
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Adicionar ao Carrinho'; }
  }
}

async function buyNow(productId, btn) {
  let product;
  try { product = await getProduct(productId); } catch {}
  if (!product) {
    if (btn) { btn.disabled = false; btn.textContent = 'Comprar Agora'; }
    return;
  }
  const extras = getOrCreateCardExtras(productId);
  product.descontoHoje = extras.descontoHoje;
  product.brinde       = extras.brinde;
  product.freteGratis  = extras.freteGratis;

  const proceed = () => {
    if (btn) { btn.disabled = true; btn.textContent = 'Aguarde...'; }
    try {
      window.cart.addItem(product, 1);
      fetch('/api/events/checkout-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: product.nome, amount: product.preco })
      }).catch(() => {});
      _showTypingMessage('Produto adicionado! Finalizando pedido...', () => {
        window.location.href = '/checkout.html?source=cart';
      });
    } catch {
      if (btn) { btn.disabled = false; btn.textContent = 'Comprar Agora'; }
    }
  };

  proceed();
}


function toggleFavorite(productId, btn) {
  // Usa e atualiza o cache em memória — não relê o localStorage
  const favorites = [..._getFavs()];
  const index = favorites.indexOf(String(productId));
  if (index > -1) {
    favorites.splice(index, 1);
    showNotification("Removido dos favoritos");
    if (btn) { btn.style.color = ''; btn.style.background = ''; btn.innerHTML = ICONS.heart; }
  } else {
    favorites.push(String(productId));
    showNotification("Adicionado aos favoritos");
    if (btn) { btn.style.color = '#e53e3e'; btn.style.background = '#fff0f0'; btn.innerHTML = ICONS.heartFilled; }
  }
  _favsCache = favorites; // atualiza cache em memória
  try { localStorage.setItem("favorites", JSON.stringify(favorites)); } catch(e) {}
}

function addToRecent(productId) {
  let recent = JSON.parse(localStorage.getItem("recent-products") || "[]");
  recent = recent.filter((id) => id !== productId);
  recent.unshift(productId);
  recent = recent.slice(0, 10);
  localStorage.setItem("recent-products", JSON.stringify(recent));
}

function showNotification(message) {
  const notif = document.createElement("div");
  notif.className = "notification";
  notif.textContent = message;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

// Pré-carrega todos os catálogos sequencialmente em background
// Android primeiro (maior catálogo e mais clicado), 150ms entre loads
const preloadAllCatalogs = () => {
  const order = ['android', 'smartwatches', 'consoles', 'acessorios', 'informatica', 'suplementos'];
  const pending = order.filter(k => !catalogCache[k] && CATALOGS[k]);
  let i = 0;
  const loadNext = () => {
    if (i >= pending.length) return;
    const key = pending[i++];
    loadCatalog(key).then(() => {
      console.log(`[PRELOAD] ${key} disponível em memória`);
      setTimeout(loadNext, 150); // 150ms (vs 300ms antes) para cachear mais rápido
    }).catch(loadNext);
  };
  loadNext();
};

// Listeners para os botões de categoria — sempre reseta para página 1
categoryButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const cat = btn.dataset.catalog;
    categoryButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    if (filterModel) filterModel.value = "";
    fetchProducts(1);
  });
});

window.startChat = startChat;
window.addToCart = addToCart;
window.buyNow = buyNow;
window.toggleFavorite = toggleFavorite;

/* Card inteiro clicável via event delegation — sem atributos inline */
document.addEventListener('click', (e) => {
  const card = e.target.closest('.olx-adcard');
  if (!card) return;
  if (e.target.closest('button, a, input, select, [role="button"]')) return;
  const url = card.dataset.productUrl;
  if (url) window.location.href = url;
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.olx-adcard[tabindex]');
  if (!card || document.activeElement !== card) return;
  e.preventDefault();
  const url = card.dataset.productUrl;
  if (url) window.location.href = url;
});

const showChat = () => {
  chatWidget.classList.add("visible");
};

if (chatClose) {
  chatClose.addEventListener("click", () => {
    chatWidget.classList.remove("visible");
  });
}

chatOptions.forEach((button) => {
  button.addEventListener("click", () => {
    const interest = button.dataset.interest;
    startChat("iPhone", interest);
  });
});

if (applyFilterButton) {
  applyFilterButton.addEventListener("click", (event) => {
    event.preventDefault();
    fetchProducts(1);
  });
}

if (filterModel) {
  filterModel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") fetchProducts(1);
  });
}

if (resetFilterButton) {
  resetFilterButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (filterModel) filterModel.value = "";
    if (filterCondition) filterCondition.value = "";
    if (filterColor) filterColor.value = "";
    if (filterMaxPrice) filterMaxPrice.value = "";
    fetchProducts(1);
  });
}

// ===== FUNÇÃO REUTILIZÁVEL PARA LOAD MORE =====
function _appendMoreProducts() {
  const offset = currentPage * PRODUCTS_PER_PAGE;
  const batch = currentProducts.slice(offset, offset + PRODUCTS_PER_PAGE);
  if (!batch.length) return;

  // insertAdjacentHTML: UMA parse de HTML para N cards (vs N parses individuais)
  productsGrid.insertAdjacentHTML('beforeend', batch.map(_buildProductCardHTML).join(''));
  currentPage++;
  initImageAutoSlider();

  const totalLoaded = Math.min(currentPage * PRODUCTS_PER_PAGE, currentProducts.length);
  updateLoadMoreBtn(currentProducts.length, totalLoaded);
  console.log(`[LOAD MORE] +${batch.length} cards | exibindo ${totalLoaded}/${currentProducts.length}`);
}

window.addEventListener("DOMContentLoaded", async () => {
  _initDebugPanel();

  // Lê URL para saber qual catálogo/página/busca carregar
  const urlState = _parseURL();

  if (urlState.mode === 'search' && urlState.termo) {
    if (filterModel) filterModel.value = urlState.termo;
  } else if (urlState.mode === 'catalog') {
    const key = urlState.catalogKey;
    categoryButtons.forEach(b => b.classList.toggle('active', b.dataset.catalog === key));
  }

  await fetchProducts(urlState.pagina);
  if (window.cart) window.cart.updateUI();
  updateCompareBadge();
  setTimeout(showChat, 5000);
  setTimeout(preloadAllCatalogs, 4000);

  // ===== NAVEGAÇÃO COM BOTÕES DO BROWSER (Voltar / Avançar) =====
  window.addEventListener('popstate', () => {
    const st = _parseURL();
    _suppressURLUpdate = true;
    if (st.mode === 'search') {
      if (filterModel) filterModel.value = st.termo;
    } else {
      categoryButtons.forEach(b => b.classList.toggle('active', b.dataset.catalog === st.catalogKey));
      if (filterModel) filterModel.value = '';
    }
    fetchProducts(st.pagina).finally(() => { _suppressURLUpdate = false; });
  });

});

function initImageAutoSlider() {
  const tracks = document.querySelectorAll(".img-track:not([data-slider-init])");

  tracks.forEach((track) => {
    track.setAttribute('data-slider-init', '1'); // evita re-inicializar o mesmo track
    let index = 0;
    let interval = null;
    let userInteracting = false;

    const images = track.querySelectorAll("img");
    if (images.length <= 1) return;

    const scrollToIndex = (i) => {
      track.scrollTo({
        left: track.clientWidth * i,
        behavior: "smooth",
      });
    };

    const startAuto = () => {
      interval = setInterval(() => {
        if (userInteracting) return;
        index = (index + 1) % images.length;
        scrollToIndex(index);
      }, 2500);
    };

    const stopAutoTemporarily = () => {
      userInteracting = true;
      clearInterval(interval);
      setTimeout(() => {
        userInteracting = false;
        startAuto();
      }, 4000);
    };

    track.addEventListener("mousedown", stopAutoTemporarily);
    track.addEventListener("touchstart", stopAutoTemporarily);
    track.addEventListener("scroll", () => {
      const newIndex = Math.round(track.scrollLeft / track.clientWidth);
      index = newIndex;
    });

    startAuto();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(initImageAutoSlider, 800);
});

const searchBtn = document.getElementById("search-btn");
const searchSpinner = searchBtn?.querySelector(".spinner");

if (searchBtn) {
  searchBtn.addEventListener("click", async () => {
    searchBtn.disabled = true;
    searchBtn.classList.add("loading");
    if (searchSpinner) searchSpinner.style.display = "inline-block";
    try {
      await fetchProducts(1);
    } finally {
      searchBtn.disabled = false;
      searchBtn.classList.remove("loading");
      if (searchSpinner) searchSpinner.style.display = "none";
    }
  });
}
