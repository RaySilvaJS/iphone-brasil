(function () {
  'use strict';

  const root = document.getElementById('product-root');
  const params = new URLSearchParams(window.location.search);
  const PRODUCT_ID = params.get('id');
  let _catalog = [];

  const IC = {
    shield:   `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    check:    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    truck:    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
    receipt:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
    lock:     `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    headset:  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
    zap:      `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    monitor:  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    memory:   `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
    cpu:      `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
    battery:  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="18" height="12" rx="2" ry="2"/><line x1="23" y1="13" x2="23" y2="11"/></svg>`,
    camera:   `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
    face:     `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
    network:  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
    heart:    `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    share:    `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
    cart:     `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
    buy:      `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    chevDown: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
    chevUp:   `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
    gift:     `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
    card:     `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
    chevL:    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
    chevR:    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  };

  const fmt = window.formatCurrency;

  const starsHtml = (n, size = '1rem') => {
    const filled = Math.max(0, Math.min(5, Math.round(n)));
    return `<span class="stars-filled" style="font-size:${size}">${'★'.repeat(filled)}${'☆'.repeat(5 - filled)}</span>`;
  };

  const formatDescription = (text) => {
    if (!text) return '';
    const lines = text.split('\n');
    let html = '';
    let inList = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        if (inList) { html += '</ul>'; inList = false; }
        continue;
      }
      if (line.startsWith('•') || line.startsWith('-')) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${line.replace(/^[•\-]\s*/, '')}</li>`;
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<p>${line}</p>`;
      }
    }
    if (inList) html += '</ul>';
    return html;
  };

  window.openLightbox = (src) => {
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox').classList.add('open');
  };
  window.closeLightbox = () => document.getElementById('lightbox').classList.remove('open');

  const updateSEO = (p, imgSrc) => {
    const title = `${p.name} — jessi.iphones`;
    const desc = `${p.condition} · ${p.storage || ''} · ${p.color || ''} · ${fmt(p.price)} em até 12x sem juros. ${(p.description || '').slice(0, 120)}...`;
    document.getElementById('page-title').textContent = title;
    document.getElementById('meta-desc').content = desc;
    document.getElementById('og-title').content = title;
    document.getElementById('og-desc').content = desc;
    if (imgSrc) document.getElementById('og-image').content = imgSrc;

    const existing = document.getElementById('json-ld');
    const schema = {
      '@context': 'https://schema.org/',
      '@type': 'Product',
      name: p.name,
      description: (p.description || '').slice(0, 500),
      brand: { '@type': 'Brand', name: p.specs?.Marca || 'Apple' },
      sku: p.id,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'BRL',
        price: p.price,
        availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: p.seller || 'jessi.iphones' }
      },
      aggregateRating: p.rating ? {
        '@type': 'AggregateRating',
        ratingValue: p.rating,
        reviewCount: p.reviews || 0
      } : undefined
    };
    if (existing) { existing.textContent = JSON.stringify(schema); }
    else {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.id = 'json-ld';
      s.textContent = JSON.stringify(schema);
      document.head.appendChild(s);
    }
  };

  window.addToCart = async (productId, btn) => {
    if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }
    try {
      const r = await fetch(`/api/products/${encodeURIComponent(productId)}`);
      if (!r.ok) throw new Error();
      const product = await r.json();
      if (typeof getOrCreateCardExtras === 'function') {
        const ex = getOrCreateCardExtras(productId);
        product.descontoHoje = ex.descontoHoje;
        product.brinde = ex.brinde;
        product.freteGratis = ex.freteGratis;
      }
      if (window.cart) window.cart.addItem(product, 1);
    } catch {
    } finally {
      if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    }
  };

  const startChat = async (model) => {
    try {
      const r = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({model, interest:'Quero comprar este produto'}) });
      const data = await r.json();
      window.open(data.url, '_blank');
    } catch { alert('Falha ao iniciar o chat.'); }
  };

  window.buyNow = async (productId, btn) => {
    if (window.Auth && !window.Auth.isLoggedIn()) {
      window.location.href = 'login.html?redirect=' + encodeURIComponent('product.html?id=' + productId);
      return;
    }
    if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }
    await window.addToCart(productId);
    // Salva o item como compra direta (lido pelo checkout.html?source=buy)
    const cartItem = window.cart && window.cart.items && window.cart.items.find(i => String(i.id) === String(productId));
    if (cartItem) {
      localStorage.setItem('iphone-vendas-buy-now', JSON.stringify({ ...cartItem, quantidade: 1 }));
    } else if (window._buyNowProduct) {
      localStorage.setItem('iphone-vendas-buy-now', JSON.stringify({
        id: window._buyNowProduct.id,
        nome: window._buyNowProduct.nome,
        preco: window._buyNowProduct.preco,
        imagem: window._buyNowProduct.imagem,
        quantidade: 1,
        descontoHoje: 0,
        brinde: null,
        freteGratis: false,
        precoOriginal: null,
      }));
    }
    _showBuyLoading();
  };

  // ── Loading overlay ("Preparando tudo para sua compra") ──────────────────────
  function _showBuyLoading() {
    const ov = document.createElement('div');
    ov.id = '__buy-loading';
    ov.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;';
    ov.innerHTML = `
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation:buyLoadSpin 1s linear infinite">
        <circle cx="22" cy="22" r="18" stroke="#E5E7EB" stroke-width="4"/>
        <path d="M22 4a18 18 0 0 1 18 18" stroke="#2563EB" stroke-width="4" stroke-linecap="round"/>
      </svg>
      <div style="text-align:center">
        <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:6px">Preparando tudo para sua compra</div>
        <div style="font-size:13px;color:#6B7280">Aguarde um momento...</div>
      </div>
      <style>@keyframes buyLoadSpin{to{transform:rotate(360deg)}}</style>`;
    document.body.appendChild(ov);
    setTimeout(() => { ov.remove(); _showInsuranceModal(); }, 400);
  }

  // ── Modal de seguro ──────────────────────────────────────────────────────────
  function _showInsuranceModal() {
    const p = window._buyNowProduct || {};
    const price = p.preco || 0;
    const pNome = p.nome || 'este produto';
    const pImg  = p.imagem || '';

    const g  = Math.round(price * 0.115);
    const rOrig = Math.round(price * 0.14);
    const rFinal = Math.round(rOrig * 0.85);

    const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const ov = document.createElement('div');
    ov.id = '__insurance-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99999;display:flex;flex-direction:column;overflow-y:auto;font-family:Inter,system-ui,sans-serif;';
    ov.innerHTML = `
      <div style="padding:20px 18px 0;border-bottom:1px solid #F3F4F6">
        <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827">Adicione um seguro</h2>
      </div>
      <div style="padding:16px 18px;flex:1">
        <div style="background:#F8FAFC;border-radius:10px;padding:14px;margin-bottom:20px;font-size:13px;color:#374151;line-height:1.5">
          <span style="color:#2563EB;font-weight:600">Proteja seu produto</span> por 12 meses contra todo tipo de roubo, danos e/ou falhas mecânicas.
        </div>

        <div style="background:#fff;border:1.5px solid #E5E7EB;border-radius:12px;padding:14px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
          <div style="width:52px;height:52px;border-radius:50%;border:2.5px solid #16A34A;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;background:#F0FDF4">
            ${pImg ? `<img src="${pImg}" style="width:38px;height:38px;object-fit:contain">` : '<span style="font-size:22px">📱</span>'}
            <svg style="position:absolute;bottom:0;right:0;color:#16A34A" width="18" height="18" viewBox="0 0 24 24" fill="#16A34A"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:#6B7280;margin-bottom:2px">Proteções para:</div>
            <div style="font-size:13px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pNome}</div>
          </div>
        </div>

        <div id="__ins-opt-g" onclick="_selectInsurance('g')" style="border:1.5px solid #E5E7EB;border-radius:10px;padding:16px 18px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;transition:border-color .15s">
          <span style="font-size:15px;font-weight:600;color:#111827">Garantia estendida</span>
          <span style="font-size:15px;font-weight:700;color:#111827">${fmt(g)}</span>
        </div>

        <div id="__ins-opt-r" onclick="_selectInsurance('r')" style="border:1.5px solid #2563EB;background:#EFF6FF;border-radius:10px;padding:16px 18px;margin-bottom:6px;cursor:pointer;position:relative;transition:border-color .15s">
          <div style="position:absolute;top:-1px;right:12px;background:#111827;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:0 0 6px 6px;letter-spacing:.5px">RECOMENDADO</div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end">
            <span style="font-size:15px;font-weight:600;color:#111827">Roubo + Danos</span>
            <div style="text-align:right">
              <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
                <s style="color:#9CA3AF;font-size:12px">${fmt(rOrig)}</s>
                <span style="background:#DCFCE7;color:#16A34A;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px">15% OFF</span>
              </div>
              <div style="font-size:17px;font-weight:800;color:#111827">${fmt(rFinal)}</div>
            </div>
          </div>
        </div>
        <div style="font-size:11px;color:#6B7280;text-align:right;margin-bottom:24px">Você economiza ${fmt(rOrig - rFinal)}</div>
      </div>

      <div style="padding:14px 18px;border-top:1px solid #F3F4F6;background:#fff;position:sticky;bottom:0">
        <div style="display:flex;gap:10px;margin-bottom:10px">
          <button onclick="_skipInsurance()" style="flex:1;padding:14px;background:#F1F5F9;color:#2563EB;font-size:14px;font-weight:700;border:none;border-radius:10px;cursor:pointer">Agora não</button>
          <button id="__ins-add-btn" onclick="_addInsurance(${g},${rFinal})" style="flex:1;padding:14px;background:#2563EB;color:#fff;font-size:14px;font-weight:700;border:none;border-radius:10px;cursor:pointer;opacity:.4;pointer-events:none">Adicionar</button>
        </div>
        <p style="text-align:center;font-size:11px;color:#9CA3AF;margin:0">Ao adicionar, você aceita as <span style="color:#2563EB">Condições gerais</span> e os <span style="color:#2563EB">Termos de cobrança do Prêmio do seguro</span>.</p>
      </div>`;
    document.body.appendChild(ov);
  }

  let _insSelected = null;
  window._selectInsurance = (type) => {
    _insSelected = type;
    const optG = document.getElementById('__ins-opt-g');
    const optR = document.getElementById('__ins-opt-r');
    const btn  = document.getElementById('__ins-add-btn');
    if (optG) optG.style.borderColor = type === 'g' ? '#2563EB' : '#E5E7EB';
    if (optG) optG.style.background  = type === 'g' ? '#EFF6FF' : '#fff';
    if (optR) optR.style.borderColor = type === 'r' ? '#2563EB' : '#E5E7EB';
    if (optR) optR.style.background  = type === 'r' ? '#EFF6FF' : '#fff';
    if (btn)  { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
  };

  window._skipInsurance = () => {
    sessionStorage.removeItem('buy-insurance');
    document.getElementById('__insurance-modal')?.remove();
    window.location.href = 'checkout.html?source=buy';
  };

  window._addInsurance = (gPrice, rPrice) => {
    if (!_insSelected) return;
    const p = window._buyNowProduct || {};
    const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const chosenPrice = _insSelected === 'g' ? gPrice : rPrice;
    const chosenLabel = _insSelected === 'g' ? 'Garantia estendida 12 meses' : 'Seguro Roubo + Danos 12 meses';
    sessionStorage.setItem('buy-insurance', JSON.stringify({ label: chosenLabel, price: chosenPrice }));
    document.getElementById('__insurance-modal')?.remove();
    window.location.href = 'checkout.html?source=buy';
  };

  const getFavs = () => { try { return JSON.parse(localStorage.getItem('iphone-favs') || '[]'); } catch { return []; } };
  const saveFavs = (arr) => { try { localStorage.setItem('iphone-favs', JSON.stringify(arr)); } catch {} };
  window.toggleFav = (id, btn) => {
    let favs = getFavs();
    const idx = favs.indexOf(id);
    if (idx > -1) { favs.splice(idx, 1); btn.style.color = ''; btn.title = 'Favoritar'; }
    else { favs.push(id); btn.style.color = '#DC2626'; btn.title = 'Remover dos favoritos'; }
    saveFavs(favs);
  };

  const setupGallery = (initialImages) => {
    if (!initialImages.length) { window._galleryUpdate = () => {}; return; }
    let images = [...initialImages];
    let current = 0;

    const heroImg  = document.getElementById('hero-img');
    const thumbsEl = document.getElementById('gallery-thumbs');

    // Preload all gallery images into browser cache to eliminate switch delay
    const preload = (srcs) => srcs.forEach(src => { const img = new Image(); img.src = src; });
    preload(images);

    let _goToTimer = null;

    const renderThumbs = () => {
      if (!thumbsEl) return;
      if (images.length <= 1) { thumbsEl.style.display = 'none'; return; }
      thumbsEl.style.display = '';
      thumbsEl.innerHTML = images.map((src, i) => `
        <button class="thumb-btn${i === current ? ' active' : ''}" aria-label="Miniatura ${i + 1}">
          <img src="${src}" alt="Miniatura ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}"/>
        </button>`).join('');
      thumbsEl.querySelectorAll('.thumb-btn').forEach((t, i) =>
        t.addEventListener('click', () => goTo(i)));
    };

    const goTo = (i) => {
      current = (i + images.length) % images.length;
      if (heroImg) {
        heroImg.style.opacity = '0';
        clearTimeout(_goToTimer);
        _goToTimer = setTimeout(() => {
          heroImg.src = images[current];
          heroImg.style.opacity = '1';
        }, 80);
      }
      if (thumbsEl) thumbsEl.querySelectorAll('.thumb-btn').forEach((t, idx) =>
        t.classList.toggle('active', idx === current));
    };

    renderThumbs();

    const prev = document.getElementById('gallery-prev');
    const next = document.getElementById('gallery-next');
    if (prev) prev.addEventListener('click', () => goTo(current - 1));
    if (next) next.addEventListener('click', () => goTo(current + 1));
    if (heroImg) heroImg.addEventListener('click', () => openLightbox(images[current]));

    window._galleryUpdate = (newImages) => {
      if (!newImages?.length) return;
      images = [...newImages];
      preload(images);
      current = 0;
      if (heroImg) {
        heroImg.style.opacity = '0';
        setTimeout(() => {
          heroImg.src = images[0];
          heroImg.style.opacity = '1';
        }, 80);
      }
      renderThumbs();
    };
  };

  const setupSpecsToggle = (totalRows) => {
    const VISIBLE = 8;
    if (totalRows <= VISIBLE) return;
    const btn = document.getElementById('specs-toggle-btn');
    const rows = document.querySelectorAll('.hidden-row');
    let expanded = false;
    if (btn) btn.addEventListener('click', () => {
      expanded = !expanded;
      rows.forEach(r => { r.style.display = expanded ? 'table-row' : 'none'; });
      btn.innerHTML = expanded
        ? `${IC.chevUp} Ocultar características`
        : `${IC.chevDown} Ver todas as ${totalRows} características`;
    });
  };

  const setupDescToggle = () => {
    const btn = document.getElementById('desc-toggle-btn');
    const full = document.getElementById('desc-full');
    const short = document.getElementById('desc-short');
    if (!btn || !full || !short) return;
    let expanded = false;
    btn.addEventListener('click', () => {
      expanded = !expanded;
      full.style.display = expanded ? '' : 'none';
      short.style.display = expanded ? 'none' : '';
      btn.innerHTML = expanded
        ? `${IC.chevUp} Ver menos`
        : `${IC.chevDown} Ver descrição completa`;
    });
  };

  const MOCK_CUSTOMERS = [
    { name: 'Carlos M.',   location: 'Sao Paulo/SP',        date: '12 jun 2025' },
    { name: 'Ana R.',      location: 'Rio de Janeiro/RJ',   date: '08 jun 2025' },
    { name: 'Fernanda L.', location: 'Belo Horizonte/MG',   date: '03 jun 2025' },
    { name: 'Ricardo S.',  location: 'Curitiba/PR',          date: '28 mai 2025' },
    { name: 'Patricia O.', location: 'Salvador/BA',          date: '21 mai 2025' },
    { name: 'Diego A.',    location: 'Porto Alegre/RS',      date: '17 mai 2025' },
    { name: 'Larissa C.',  location: 'Brasilia/DF',          date: '11 mai 2025' },
    { name: 'Gustavo B.',  location: 'Fortaleza/CE',         date: '05 mai 2025' },
  ];

  const IC_PIN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  const IC_CHECK_SM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const IC_PERSON   = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const IC_USERS    = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  const IC_PKG      = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
  const IC_THUMBUP  = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
  const IC_STAR_F   = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

  const renderTrustStrip = (product, reviewsList) => {
    const rating    = product.rating || 5;
    const reviews   = product.reviews || 0;
    const clients   = Math.max(2847, reviews * 3 + 847);
    const delivered = Math.max(3241, reviews * 2 + 1200);
    const satisf    = Math.min(99, Math.round(rating / 5 * 100));
    const fmtN = (n) => n.toLocaleString('pt-BR');
    return `
      <div class="trust-strip" role="region" aria-label="Indicadores de confiança">
        <div class="trust-metric">
          <div class="tm-icon yellow">
            <svg viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <div class="tm-value">${rating.toFixed(1)}</div>
          <div class="tm-label">Nota média</div>
        </div>
        <div class="trust-metric">
          <div class="tm-icon">${IC_USERS}</div>
          <div class="tm-value">${fmtN(clients)}+</div>
          <div class="tm-label">Clientes atendidos</div>
        </div>
        <div class="trust-metric">
          <div class="tm-icon green">${IC_PKG}</div>
          <div class="tm-value">${fmtN(delivered)}+</div>
          <div class="tm-label">Pedidos entregues</div>
        </div>
        <div class="trust-metric">
          <div class="tm-icon purple">${IC_THUMBUP}</div>
          <div class="tm-value">${satisf}%</div>
          <div class="tm-label">Taxa de satisfação</div>
        </div>
      </div>`;
  };

  const renderRatingMiniCard = (product, reviewsList) => {
    const rating  = product.rating || 5;
    const reviews = product.reviews || 0;
    if (reviews === 0) return '';

    const filled = Math.min(5, Math.round(rating));
    const stars  = '★'.repeat(filled) + '☆'.repeat(5 - filled);

    return `
      <div class="card rating-mini-card" role="complementary" aria-label="Resumo das avaliações">
        <div class="rmk-stars-row">
          <span class="rmk-stars">${stars}</span>
          <span class="rmk-score">${rating.toFixed(1)}&thinsp;/&thinsp;5</span>
        </div>
        <div class="rmk-base">Baseado em ${reviews.toLocaleString('pt-BR')} avaliações verificadas</div>
        <button class="rmk-btn" onclick="document.getElementById('reviews-title')?.scrollIntoView({behavior:'smooth',block:'start'})">
          Ver todas as avaliações
        </button>
      </div>`;
  };

  const renderReviewsPreview = (reviewsList, productImgs) => {
    if (!reviewsList.length) return '';

    // 3 best reviews (highest rating, with text)
    const topReviews = [...reviewsList]
      .filter(r => r.text && r.text.trim().length > 10)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3);

    if (!topReviews.length) return '';

    // All photos from reviews (real data only)
    const allPhotos = reviewsList
      .flatMap(r => Array.isArray(r.images) ? r.images : [])
      .filter(u => typeof u === 'string' && u.startsWith('http'))
      .slice(0, 8);

    const photosHtml = allPhotos.length ? `
      <div class="reviews-photo-strip">
        <div class="rps-title">Fotos enviadas por clientes</div>
        ${allPhotos.map((img, i) => `<img class="rps-img" src="${img}" alt="Foto de cliente ${i+1}" loading="lazy" onclick="openLightbox('${img}')">`).join('')}
      </div>` : '';

    const reviewsHtml = topReviews.map(rv => {
      const nameFull  = rv.name || rv.author || 'Cliente';
      const initials  = nameFull.trim().slice(0, 2).toUpperCase();
      const filled    = Math.min(5, Math.round(rv.rating || 5));
      const stars     = '★'.repeat(filled) + '☆'.repeat(5 - filled);
      const snippet   = (rv.text || '').length > 160 ? rv.text.slice(0, 160) + '…' : rv.text;
      const firstPhoto = Array.isArray(rv.images) ? rv.images.find(u => typeof u === 'string' && u.startsWith('http')) : null;
      return `
        <div class="review-preview-card">
          <div class="rpc-header">
            <div class="rpc-avatar">${initials}</div>
            <div class="rpc-meta">
              <div class="rpc-name">${nameFull}</div>
              <div class="rpc-date">${rv.date || ''}</div>
            </div>
            ${firstPhoto ? `<img class="rpc-photo" src="${firstPhoto}" alt="Foto da avaliação" loading="lazy" onclick="openLightbox('${firstPhoto}')">` : ''}
          </div>
          <div class="rpc-stars">${stars}</div>
          <div class="rpc-text">${snippet}</div>
          <div class="rpc-verified">${IC_CHECK_SM} Compra verificada</div>
        </div>`;
    }).join('');

    return `
      <section class="section" aria-labelledby="preview-reviews-title">
        <h2 class="section-title" id="preview-reviews-title">O que dizem os clientes</h2>
        ${photosHtml}
        <div class="review-preview-grid">${reviewsHtml}</div>
        <div style="text-align:center;margin-top:16px;">
          <button onclick="document.getElementById('reviews-title')?.scrollIntoView({behavior:'smooth',block:'start'})"
            style="background:none;border:1.5px solid var(--blue);border-radius:8px;padding:9px 20px;font-size:.875rem;font-weight:700;color:var(--blue);cursor:pointer;transition:background .2s;"
            onmouseover="this.style.background='var(--blue-light)'" onmouseout="this.style.background='none'">
            Ver todas as avaliações
          </button>
        </div>
      </section>`;
  };

  const renderCustomerCards = (product, reviewsList, customerImgs) => {
    const productShortName = (product.name || '').length > 28
      ? product.name.slice(0, 28) + '…'
      : (product.name || 'Produto');

    const cards = MOCK_CUSTOMERS.map((c, i) => {
      const img = customerImgs[i] || null;
      return `
        <div class="customer-card">
          ${img
            ? `<img class="customer-card-img" src="${img}" alt="Foto de ${c.name}" loading="lazy" onclick="openLightbox('${img}')">`
            : `<div class="customer-card-placeholder">${IC_PERSON}</div>`}
          <div class="customer-card-body">
            <div class="cc-name">${c.name}</div>
            <div class="cc-location">${IC_PIN} ${c.location}</div>
            <div class="cc-product">${productShortName}</div>
            <div class="cc-date">${c.date}</div>
            <div class="cc-verified">${IC_CHECK_SM} Compra verificada</div>
          </div>
        </div>`;
    }).join('');

    return `
      <section class="section" aria-labelledby="customer-gallery-title">
        <h2 class="section-title" id="customer-gallery-title">Clientes Recebendo Seus Produtos</h2>
        <div class="customer-cards-grid">${cards}</div>
      </section>`;
  };

  const buildReviewItem = (rv) => `
    <div class="review-item" data-rating="${Math.round(rv.rating || 5)}">
      <div class="review-item-header">
        ${starsHtml(rv.rating)}
        <span class="review-date">${rv.date || ''}</span>
      </div>
      <p class="review-text">${rv.text || ''}</p>
      ${rv.images?.length ? `<div class="review-photos">${rv.images.map(img => `<img src="${img}" alt="Foto da avaliação" loading="lazy" onclick="openLightbox('${img}')">`).join('')}</div>` : ''}
    </div>`;

  const setupLazyReviews = (reviewsList) => {
    const section = document.getElementById('reviews-lazy-section');
    const filtersEl = document.getElementById('reviews-filter-row');
    if (!section) return;

    if (!reviewsList?.length) {
      if (filtersEl) filtersEl.style.display = 'none';
      return;
    }

    const render = (list) => {
      section.innerHTML = list.length
        ? list.map(buildReviewItem).join('')
        : `<p class="reviews-placeholder">Nenhuma avaliação encontrada para este filtro.</p>`;
    };

    // Render via IntersectionObserver for performance
    let rendered = false;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || rendered) return;
        rendered = true;
        observer.disconnect();
        render(reviewsList);
        setupFilters();
      });
    }, { threshold: 0.05 });
    observer.observe(section);

    const setupFilters = () => {
      if (!filtersEl) return;
      filtersEl.style.display = 'flex';

      // Count per star from real data
      const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      reviewsList.forEach(r => { const s = Math.round(r.rating || 5); if (counts[s] !== undefined) counts[s]++; });

      const starsWithData = [5, 4, 3, 2, 1].filter(s => counts[s] > 0);
      const chips = [
        { label: 'Todas', value: 0, count: reviewsList.length },
        ...starsWithData.map(s => ({ label: `${s} estrelas`, value: s, count: counts[s] }))
      ];

      filtersEl.innerHTML = chips.map((c, i) => `
        <button class="rf-chip${i === 0 ? ' active' : ''}" data-filter="${c.value}">
          ${c.label} <span class="rf-count">(${c.count})</span>
        </button>`).join('');

      filtersEl.querySelectorAll('.rf-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          filtersEl.querySelectorAll('.rf-chip').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const val = parseInt(btn.dataset.filter, 10);
          const filtered = val === 0 ? reviewsList : reviewsList.filter(r => Math.round(r.rating || 5) === val);
          render(filtered);
        });
      });
    };
  };

  const loadRelatedFromData = (others) => {
    const container = document.getElementById('related-container');
    if (!container) return;
    try {
      if (!others.length) { container.closest('.section').remove(); return; }
      container.innerHTML = others.map(p => {
        const img = (Array.isArray(p.images) ? p.images : []).find(s =>
          typeof s === 'string' && s.length > 4 && (s.startsWith('http') || s.startsWith('/uploads/'))
        ) || '';
        return `
          <a class="related-card" href="product.html?id=${p.id}">
            ${img ? `<img src="${img}" alt="${p.name}" loading="lazy"/>` : `<div style="aspect-ratio:1;background:#f1f5f9;display:flex;align-items:center;justify-content:center;"><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>`}
            <div class="related-card-body">
              <div class="related-card-name">${p.name}</div>
              ${p.rating ? `<div style="color:#F59E0B;font-size:.8rem;margin-bottom:4px;">${'★'.repeat(Math.round(p.rating))} <span style="color:#475569;font-size:.75rem;">${p.rating.toFixed(1)}</span></div>` : ''}
              ${p.priceOriginal ? `<div class="related-card-original">${fmt(p.priceOriginal)}</div>` : ''}
              <div class="related-card-price">${fmt(p.price)}</div>
              <button onclick="event.preventDefault();window.location.href='product.html?id=${p.id}'" style="margin-top:8px;width:100%;padding:7px;background:var(--blue);color:#fff;border:none;border-radius:7px;font-size:.8rem;font-weight:700;cursor:pointer;">Comprar</button>
            </div>
          </a>`;
      }).join('');
    } catch { if (container.closest('.section')) container.closest('.section').remove(); }
  };

  const renderProduct = (product, storeDiscount = 0) => {
    const isValidImg = (s) => typeof s === 'string' && s.length > 4 && (s.startsWith('http') || s.startsWith('/uploads/'));

    const images = (Array.isArray(product.images) ? product.images : []).filter(isValidImg);
    const reviewImgs = (Array.isArray(product.reviewsList) ? product.reviewsList : [])
      .flatMap(r => Array.isArray(r.images) ? r.images : []).filter(isValidImg);
    const detailImages = Array.isArray(product.detailImages) ? product.detailImages.filter(isValidImg) : [];
    const heroSrc = images[0] || '';
    const specs = product.specs || {};

    const extras = typeof getOrCreateCardExtras === 'function'
      ? getOrCreateCardExtras(product.id)
      : { descontoHoje: 20, brinde: 'Apple Watch', freteGratis: false, stock: Math.floor(Math.random() * 50) + 1 };

    const mlPrice = product.price;
    const basePrice = storeDiscount > 0
      ? Math.round(mlPrice * (1 - storeDiscount / 100) * 100) / 100
      : mlPrice;
    const originalPrice = storeDiscount > 0 ? mlPrice : (product.priceOriginal || mlPrice);
    const promoPercent = storeDiscount > 0 ? storeDiscount : (product.promoPercent || Math.round((1 - mlPrice / (product.priceOriginal || mlPrice)) * 100));
    const installment = (basePrice / 12).toFixed(2).replace('.', ',');

    const mlUrl = product.url ||
      (String(product.id || '').startsWith('MLB') ? 'https://www.mercadolivre.com.br/p/' + product.id : '');
    const showMlCard = storeDiscount > 0;

    updateSEO(product, heroSrc);

    const reviewsList = Array.isArray(product.reviewsList) ? product.reviewsList : [];
    const dist = [5, 4, 3, 2, 1].map(star => ({
      star,
      count: reviewsList.filter(r => Math.round(r.rating) === star).length
    }));

    const customerImgs = reviewsList
      .flatMap(r => Array.isArray(r.images) ? r.images : [])
      .filter(u => typeof u === 'string' && u.startsWith('http'));

    const HL_SPECS = [
      { label: 'Tela', key: 'Tamanho da tela', icon: IC.monitor },
      { label: 'Memória', key: 'Memória interna', icon: IC.memory },
      { label: 'RAM', key: 'Memória RAM', icon: IC.cpu },
      { label: 'Rede', key: 'Rede móvel', icon: IC.network },
      { label: 'Processador', key: 'Velocidade do processador', icon: IC.zap },
      { label: 'Câmera', key: 'Resolução da câmera traseira principal', icon: IC.camera },
      { label: 'Bateria', key: 'Tipo de bateria', icon: IC.battery },
      { label: 'Face ID', key: 'Com reconhecimento facial', icon: IC.face },
    ];

    const specEntries = Object.entries(specs);
    const VISIBLE_ROWS = 8;

    const html = `
      <nav class="breadcrumb" aria-label="Navegação">
        <a href="index.html">Home</a>
        <span class="breadcrumb-sep">/</span>
        <a href="index.html">Smartphones</a>
        <span class="breadcrumb-sep">/</span>
        <a href="index.html">Apple</a>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">${product.name}</span>
      </nav>

      <div class="product-top-grid">

        <section class="gallery-panel" aria-label="Galeria de imagens">
          <div class="gallery-card">
            <div class="gallery-main">
              ${promoPercent > 0 ? `<span class="gallery-badge-promo">${promoPercent}% OFF</span>` : ''}
              <button class="gallery-fab gallery-fab-heart" id="fav-btn" title="Favoritar"
                onclick="toggleFav('${product.id}', this)"
                style="color:${getFavs().includes(product.id) ? '#DC2626' : 'inherit'}">
                ${IC.heart}
              </button>
              <button class="gallery-fab gallery-fab-share" title="Compartilhar"
                onclick="if(navigator.share){navigator.share({title:'${product.name}',url:window.location.href})}else{navigator.clipboard&&navigator.clipboard.writeText(window.location.href);alert('Link copiado!')}">
                ${IC.share}
              </button>
              ${images.length ? `
                <button class="gallery-nav-btn prev" id="gallery-prev" aria-label="Imagem anterior">${IC.chevL}</button>
                <img id="hero-img" src="${heroSrc}" alt="${product.name}" style="cursor:zoom-in;"/>
                <button class="gallery-nav-btn next" id="gallery-next" aria-label="Próxima imagem">${IC.chevR}</button>
              ` : `<div class="gallery-empty"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span>Imagem não disponível</span></div>`}
            </div>
            <div class="gallery-thumbs" id="gallery-thumbs"${images.length <= 1 ? ' style="display:none"' : ''}>
              ${images.length > 1 ? images.map((src, i) => `
                <button class="thumb-btn${i===0?' active':''}" aria-label="Miniatura ${i+1}">
                  <img src="${src}" alt="Miniatura ${i+1}" loading="${i===0?'eager':'lazy'}"/>
                </button>`).join('') : ''}
            </div>
          </div>
        </section>

        <aside class="sidebar-panel">

          <div class="card">
            <div class="product-condition-row">
              <span class="badge-condition">${product.condition || 'Novo'}</span>
              ${(product.reviews||0) > 50 ? `<span class="badge-bestseller"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Mais Vendido</span>` : ''}
              ${(product.reviews||0) > 0 ? `<span class="badge-sold">+${Math.floor((product.reviews||0)/10)*10} vendidos</span>` : ''}
            </div>
            <h1 class="product-name">${product.name}</h1>
            <div class="rating-row">
              ${starsHtml(product.rating || 5, '.95rem')}
              <span class="rating-val">${(product.rating||5).toFixed(1)}</span>
              <span class="rating-count">(${(product.reviews||0).toLocaleString('pt-BR')} avaliações)</span>
              <a href="#" class="rating-link" onclick="event.preventDefault();document.getElementById('reviews-title')?.scrollIntoView({behavior:'smooth'})">Ver avaliações</a>
            </div>
            <div class="seller-row">
              Vendido por <strong>${product.seller || 'jessi.iphones'}</strong>
              <span class="seller-verified"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Vendedor verificado</span>
            </div>
          </div>

          <div class="card">
            <div class="daily-badge">
              ${IC.zap} Desconto do dia: ${extras.descontoHoje}% OFF
            </div>
            <div class="price-original" id="price-original"${originalPrice <= basePrice ? ' style="display:none"' : ''}>De: ${fmt(originalPrice)}</div>
            <div class="price-main-row">
              <div class="price-current" id="price-current">${fmt(basePrice)}</div>
              <span class="price-discount-badge" id="price-discount-badge"${promoPercent <= 0 ? ' style="display:none"' : ''}>${promoPercent}% OFF</span>
            </div>
            <div class="installment-row" id="price-installment">
              ${IC.card} ou em até <strong>12x de R$ ${installment}</strong> sem juros
            </div>
            <div class="gift-row">
              ${IC.gift} Brinde: ${extras.brinde}
            </div>
            ${extras.freteGratis || product.free_shipping
              ? `<div class="shipping-badge">${IC.truck} Frete grátis — Envio rápido</div>`
              : `<p class="shipping-calc">${IC.truck} Calcule o frete na finalização da compra</p>`}
          </div>

          ${renderRatingMiniCard(product, reviewsList)}

          ${showMlCard ? `
          <div class="ml-compare-card">

            <div class="ml-compare-header">
              <div class="ml-brand">
                <img src="https://i.ibb.co/Gf6RgpcN/image.png" alt="Mercado Livre" class="ml-logo-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <div class="ml-logo-badge" style="display:none">ML</div>
                <span class="ml-brand-name">Mercado Livre</span>
              </div>
              <span class="ml-compare-badge">Comparador de preço</span>
            </div>

            <div class="ml-price-block">
              <div class="ml-price-row">
                <span class="ml-price-label">Preço no Mercado Livre:</span>
                <span class="ml-price-ml" id="ml-price-ml">${fmt(originalPrice)}</span>
              </div>
              <div class="ml-price-row">
                <span class="ml-price-label">Preço aqui na loja:</span>
                <span class="ml-price-store" id="ml-price-store">${fmt(basePrice)}</span>
              </div>
            </div>

            <details class="ml-why">
              <summary>Por que é mais barato aqui do que no Mercado Livre?</summary>
              <div class="ml-why-content">
                <p>Ao vender no Mercado Livre, os lojistas pagam <strong>comissões de 12% a 16%</strong> sobre cada venda, além de taxas de anúncio impulsionado, frete subsidiado obrigatório e custos de plataforma. Tudo isso é embutido no preço final que você vê por lá.</p>
                <p>Aqui, vendemos <strong>diretamente para você</strong>, sem pagar comissão para nenhuma plataforma intermediária. Essa economia vai integralmente para o seu bolso — sem abrir mão da qualidade, nota fiscal ou garantia de fábrica.</p>
                <p>É o mesmo produto, do mesmo distribuidor autorizado — só que sem o custo extra do marketplace.</p>
              </div>
            </details>

            <button class="ml-link-btn" id="ml-link-btn" onclick="window.open('${mlUrl}', '_blank')">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Ver anúncio original no Mercado Livre
            </button>

          </div>` : ''}

          <div class="card" id="variations-card">
            <div style="margin-bottom:14px;">
              <div class="section-label">Cor</div>
              <div class="variation-chips">
                <button class="variation-chip active">${product.color || 'Padrão'}</button>
              </div>
            </div>
            <div>
              <div class="section-label">Armazenamento</div>
              <div class="variation-chips">
                <button class="variation-chip active">${product.storage || 'Padrão'}</button>
              </div>
            </div>
          </div>

          <div class="card" id="stock-display" style="padding:14px 18px;">
            <div class="stock-row">
              <span class="stock-dot ${extras.stock <= 5 ? 'low' : 'ok'}"></span>
              ${extras.stock <= 5
                ? `<span style="color:var(--red);font-weight:600;">Últimas ${extras.stock} unidade${extras.stock > 1 ? 's' : ''} disponível${extras.stock > 1 ? 'is' : ''}!</span>`
                : `<span style="color:var(--green);">Em estoque — ${extras.stock} disponível${extras.stock > 1 ? 'is' : ''}</span>`}
            </div>
          </div>

          <div class="card">
            <div class="actions-grid">
              <button class="btn btn-secondary" onclick="buyNow('${product.id}', this)">
                ${IC.buy} Comprar Agora
              </button>
              <button class="btn btn-ml-add" onclick="addToCart('${product.id}', this)">
                ${IC.cart} Adicionar ao Carrinho
              </button>
            </div>
            <div id="urgency-widgets"></div>
            <div id="view-counter" role="status" aria-live="polite">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke-width="2"/></svg>
              <span id="view-counter-text"></span>
            </div>
            <div class="trust-badges-inline">
              <div class="tbi-item">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <div><strong>Compra protegida</strong>Pagamento 100% seguro</div>
              </div>
              <div class="tbi-item">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <div><strong>SSL Ativo</strong>Dados criptografados</div>
              </div>
              <div class="tbi-item">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <div><strong>Atendimento WhatsApp</strong>Suporte em tempo real</div>
              </div>
              <div class="tbi-item">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10" stroke-width="2.5"/></svg>
                <div><strong>LGPD</strong>Dados protegidos por lei</div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="section-label" style="margin-bottom:12px;">Por que comprar aqui?</div>
            <div class="benefits-grid">
              <div class="benefit-item">
                <div class="benefit-icon">${IC.lock}</div>
                <div class="benefit-text"><strong>Compra Segura</strong><span>Pagamento protegido e confirmado</span></div>
              </div>
              <div class="benefit-item">
                <div class="benefit-icon">${IC.shield}</div>
                <div class="benefit-text"><strong>Garantia</strong><span>Garantia de fábrica incluída</span></div>
              </div>
              <div class="benefit-item">
                <div class="benefit-icon">${IC.receipt}</div>
                <div class="benefit-text"><strong>Nota Fiscal</strong><span>NF-e emitida em seu nome</span></div>
              </div>
              <div class="benefit-item">
                <div class="benefit-icon">${IC.check}</div>
                <div class="benefit-text"><strong>Original</strong><span>Distribuidor autorizado</span></div>
              </div>
              <div class="benefit-item">
                <div class="benefit-icon">${IC.truck}</div>
                <div class="benefit-text"><strong>Entrega Rápida</strong><span>Envio com rastreio em tempo real</span></div>
              </div>
              <div class="benefit-item">
                <div class="benefit-icon">${IC.headset}</div>
                <div class="benefit-text"><strong>Suporte</strong><span>Atendimento pós-venda dedicado</span></div>
              </div>
            </div>
          </div>

        </aside>
      </div>

      <section class="section" aria-labelledby="hl-title">
        <h2 class="section-title" id="hl-title">O que você precisa saber</h2>
        <div class="highlight-grid">
          ${HL_SPECS.map(h => {
            const val = specs[h.key] || '—';
            return `<div class="highlight-card">
              <div class="h-icon">${h.icon}</div>
              <div class="h-label">${h.label}</div>
              <div class="h-value">${val}</div>
            </div>`;
          }).join('')}
        </div>
      </section>

      <section class="section" aria-labelledby="desc-title">
        <h2 class="section-title" id="desc-title">Descrição do produto</h2>
        <div class="description-content">
          <div id="desc-short">${formatDescription((product.description || '').slice(0, 600))}${(product.description||'').length > 600 ? '<p>...</p>' : ''}</div>
          <div id="desc-full" style="display:none;">${formatDescription(product.description || '')}</div>
        </div>
        ${(product.description||'').length > 600 ? `<button class="desc-toggle-btn" id="desc-toggle-btn">${IC.chevDown} Ver descrição completa</button>` : ''}
      </section>

      <section class="section" aria-labelledby="specs-title">
        <h2 class="section-title" id="specs-title">Características técnicas</h2>
        <div style="overflow-x:auto;max-width:100%;">
        <table class="specs-table" aria-label="Especificações do produto">
          <tbody>
            ${specEntries.map(([k, v], i) => `
              <tr class="${i >= VISIBLE_ROWS ? 'hidden-row' : ''}" ${i >= VISIBLE_ROWS ? 'style="display:none;"' : ''}>
                <th scope="row">${k}</th>
                <td>${v || '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        </div>
        ${specEntries.length > VISIBLE_ROWS ? `
          <button class="specs-toggle-btn" id="specs-toggle-btn">
            ${IC.chevDown} Ver todas as ${specEntries.length} características
          </button>` : ''}
      </section>

      ${renderReviewsPreview(reviewsList)}

      <section class="section" aria-labelledby="reviews-title">
        <h2 class="section-title" id="reviews-title">Avaliações dos clientes</h2>
        <div class="reviews-summary">
          <div class="reviews-big-score">
            <div class="score-num">${(product.rating||5).toFixed(1)}</div>
            <div class="score-stars">${starsHtml(product.rating||5, '1.1rem')}</div>
            <div class="score-count">${(product.reviews||0).toLocaleString('pt-BR')} avaliações</div>
          </div>
          <div class="reviews-bars">
            ${dist.map(d => {
              const pct = reviewsList.length ? Math.round(d.count / reviewsList.length * 100) : 0;
              return `<div class="bar-row">
                <span class="bar-label">${d.star}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
                <span class="bar-count">${d.count}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div id="reviews-filter-row" class="reviews-filter-row" style="display:none;" role="group" aria-label="Filtrar por estrelas"></div>
        <div class="reviews-list" id="reviews-lazy-section">
          ${reviewsList.length === 0
            ? '<p class="reviews-placeholder">Nenhuma avaliação textual disponível ainda.</p>'
            : '<p class="reviews-placeholder" style="padding:12px 0;">Carregando avaliações...</p>'}
        </div>
      </section>

      ${renderCustomerCards(product, reviewsList, customerImgs)}

      <section class="section" aria-labelledby="qa-title">
        <h2 class="section-title" id="qa-title">Perguntas e respostas</h2>
        <div class="qa-input-row">
          <input class="qa-input" type="text" id="qa-input" placeholder="Escreva sua pergunta sobre o produto..." maxlength="300" aria-label="Digite sua pergunta"/>
          <button class="qa-submit" onclick="handleQA()">Perguntar</button>
        </div>
        <p class="qa-placeholder">Nenhuma pergunta ainda. Seja o primeiro a perguntar!</p>
      </section>

      <section class="section" aria-labelledby="related-title">
        <h2 class="section-title" id="related-title">Você também pode gostar</h2>
        <div class="related-grid" id="related-container">
          <p style="color:var(--muted);font-size:.875rem;grid-column:1/-1;">Carregando produtos relacionados...</p>
        </div>
      </section>
    `;

    swapSkeletonForContent(html);

    setupGallery(images);
    loadMLVariations(product, storeDiscount);
    setupSpecsToggle(specEntries.length);
    setupDescToggle();
    setupLazyReviews(reviewsList);
  };

  /* ── SKELETON → CONTEÚDO REAL (crossfade) ── */
  const swapSkeletonForContent = (html) => {
    const skeleton = document.getElementById('product-skeleton');
    const content = document.createElement('div');
    content.className = 'product-content-fade';
    content.innerHTML = html;

    if (!skeleton) {
      root.innerHTML = '';
      root.appendChild(content);
      requestAnimationFrame(() => content.classList.add('sk-visible'));
      return;
    }

    skeleton.classList.add('sk-fade-out');
    root.appendChild(content);
    setTimeout(() => {
      skeleton.remove();
      requestAnimationFrame(() => content.classList.add('sk-visible'));
    }, 220);
  };

  const loadMLVariations = (product, storeDiscount) => {
    const card = document.getElementById('variations-card');
    if (!card) return;

    const isValidImg = (s) => typeof s === 'string' && s.length > 4 && (s.startsWith('http') || s.startsWith('/uploads/'));

    const siblings = _catalog.filter(p => p.model && p.model === product.model);

    if (siblings.length <= 1) {
      card.innerHTML = `
        <div style="margin-bottom:14px;">
          <div class="section-label">Cor</div>
          <div class="variation-chips">
            <button class="variation-chip active">${product.color || 'Padrão'}</button>
          </div>
        </div>
        <div>
          <div class="section-label">Armazenamento</div>
          <div class="variation-chips">
            <button class="variation-chip active">${product.storage || 'Padrão'}</button>
          </div>
        </div>`;
      return;
    }

    const colors   = [...new Set(siblings.map(p => p.color).filter(Boolean))];
    const storages = [...new Set(siblings.map(p => p.storage).filter(Boolean))];

    const sel = { color: product.color || colors[0], storage: product.storage || storages[0] };

    const colorOk   = (c) => siblings.some(p => p.color   === c && (p.stock ?? 0) > 0);
    const storageOk = (s) => siblings.some(p => p.storage === s && (p.stock ?? 0) > 0);

    const findBestSibling = (type, val) => {
      if (type === 'color') {
        return siblings.find(p => p.color === val && p.storage === sel.storage)
            || siblings.find(p => p.color === val && (p.stock ?? 0) > 0)
            || siblings.find(p => p.color === val);
      }
      return siblings.find(p => p.storage === val && p.color === sel.color)
          || siblings.find(p => p.storage === val && (p.stock ?? 0) > 0)
          || siblings.find(p => p.storage === val);
    };

    const applyVariant = (p) => {
      if (!p) return;

      const u = new URL(window.location.href);
      u.searchParams.set('id', p.id);
      history.pushState({ id: p.id }, '', u.toString());

      const elName = document.querySelector('.product-name');
      if (elName) elName.textContent = p.name;

      const imgs = (Array.isArray(p.images) ? p.images : []).filter(isValidImg);
      if (window._galleryUpdate) window._galleryUpdate(imgs.length ? imgs : (product.images || []).filter(isValidImg));

      const mlPrice   = p.price;
      const basePrice = storeDiscount > 0
        ? Math.round(mlPrice * (1 - storeDiscount / 100) * 100) / 100
        : mlPrice;
      const origPrice = storeDiscount > 0 ? mlPrice : (p.priceOriginal || mlPrice);
      const promo     = storeDiscount > 0 ? storeDiscount
        : Math.round((1 - mlPrice / (p.priceOriginal || mlPrice)) * 100);
      const install   = (basePrice / 12).toFixed(2).replace('.', ',');

      const elOrig   = document.getElementById('price-original');
      const elCurr   = document.getElementById('price-current');
      const elBadge  = document.getElementById('price-discount-badge');
      const elInst   = document.getElementById('price-installment');
      const galBadge = document.querySelector('.gallery-badge-promo');

      if (elOrig)   { elOrig.textContent   = `De: ${fmt(origPrice)}`; elOrig.style.display   = origPrice > basePrice ? '' : 'none'; }
      if (elCurr)   elCurr.textContent     = fmt(basePrice);
      if (elBadge)  { elBadge.textContent  = `${promo}% OFF`;         elBadge.style.display  = promo > 0 ? '' : 'none'; }
      if (elInst)   elInst.innerHTML       = `${IC.card} ou em até <strong>12x de R$ ${install}</strong> sem juros`;
      if (galBadge) { galBadge.textContent = `${promo}% OFF`;         galBadge.style.display = promo > 0 ? '' : 'none'; }

      const qty     = p.stock ?? 0;
      const elStock = document.getElementById('stock-display');
      if (elStock) {
        const low = qty <= 3;
        elStock.innerHTML = `<div class="stock-row">
          <span class="stock-dot ${low ? 'low' : 'ok'}"></span>
          ${low
            ? `<span style="color:var(--red);font-weight:600;">Últimas ${qty} unidade${qty !== 1 ? 's' : ''} disponível${qty !== 1 ? 'is' : ''}</span>`
            : `<span style="color:var(--green);">Em estoque — ${qty} disponível${qty !== 1 ? 'is' : ''}</span>`}
        </div>`;
      }

      document.querySelectorAll('[onclick*="buyNow("]').forEach(b =>
        b.setAttribute('onclick', `buyNow('${p.id}', this)`));
      document.querySelectorAll('[onclick*="addToCart("]').forEach(b =>
        b.setAttribute('onclick', `addToCart('${p.id}', this)`));

      const newMlUrl = p.url || (String(p.id).startsWith('MLB') ? 'https://www.mercadolivre.com.br/p/' + p.id : '');
      const elMlML    = document.getElementById('ml-price-ml');
      const elMlStore = document.getElementById('ml-price-store');
      const elMlBtn   = document.getElementById('ml-link-btn');
      if (elMlML)    elMlML.textContent    = fmt(origPrice);
      if (elMlStore) elMlStore.textContent = fmt(basePrice);
      if (elMlBtn && newMlUrl) elMlBtn.setAttribute('onclick', `window.open('${newMlUrl}', '_blank')`);
    };

    const renderChips = () => {
      let html = '';

      if (colors.length > 1) {
        const cards = colors.map(c => {
          const active  = c === sel.color;
          const avail   = colorOk(c);
          const sib     = siblings.find(p => p.color === c) || null;
          const img     = sib ? (Array.isArray(sib.images) ? sib.images : []).find(isValidImg) || '' : '';
          const price   = sib ? fmt(sib.price) : '';
          const status  = active ? 'Disponível'
                        : avail  ? 'Disponível em<br>outras opções'
                        :          'Sem estoque';
          return `<button
            class="var-color-card${active ? ' active' : ''}"
            data-type="color" data-val="${c.replace(/"/g, '&quot;')}"
            ${!avail ? 'disabled' : ''}
          >${img
            ? `<img src="${img}" alt="${c}" loading="lazy"/>`
            : `<div style="width:56px;height:56px;margin:0 auto 5px;background:var(--bg);border-radius:6px;"></div>`}
            <div class="vcc-name">${c}</div>
            ${price ? `<div class="vcc-price">${price}</div>` : ''}
            <div class="vcc-status">${status}</div>
          </button>`;
        }).join('');
        html += `<div style="margin-bottom:16px;">
          <div class="section-label">Cor<span style="font-weight:500;text-transform:none;color:var(--text);margin-left:6px;letter-spacing:0">${sel.color || ''}</span></div>
          <div class="var-color-cards">${cards}</div>
        </div>`;
      }

      if (storages.length > 1) {
        const chips = storages.map(s => {
          const active = s === sel.storage;
          const avail  = storageOk(s);
          return `<button class="variation-chip${active ? ' active' : ''}"
            data-type="storage" data-val="${s.replace(/"/g, '&quot;')}"
            ${!avail ? 'disabled title="Sem estoque"' : ''}>${s}</button>`;
        }).join('');
        html += `<div>
          <div class="section-label">Armazenamento<span style="font-weight:500;text-transform:none;color:var(--text);margin-left:6px;letter-spacing:0">${sel.storage || ''}</span></div>
          <div class="variation-chips">${chips}</div>
        </div>`;
      }

      if (!html) {
        html = `
          <div style="margin-bottom:14px;">
            <div class="section-label">Cor</div>
            <div class="variation-chips"><button class="variation-chip active">${sel.color || 'Padrão'}</button></div>
          </div>
          <div>
            <div class="section-label">Armazenamento</div>
            <div class="variation-chips"><button class="variation-chip active">${sel.storage || 'Padrão'}</button></div>
          </div>`;
      }

      card.innerHTML = html;

      card.querySelectorAll('.variation-chip:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.type;
          const val  = btn.dataset.val;
          const match = findBestSibling(type, val);
          if (match) {
            sel.color   = match.color   || sel.color;
            sel.storage = match.storage || sel.storage;
            applyVariant(match);
          }
          renderChips();
        });
      });
    };

    renderChips();
  };

  window.handleQA = () => {
    const input = document.getElementById('qa-input');
    if (!input || !input.value.trim()) { input?.focus(); return; }
    alert(`Sua pergunta foi enviada: "${input.value.trim()}"\nVocê será notificado quando houver uma resposta.`);
    input.value = '';
  };

  const ACTIVITY_ICONS = {
    viewing:        { cls: 'view', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`, label: 'visualizou este produto' },
    checkout_start: { cls: 'buy', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`, label: 'iniciou uma compra' },
    pix_created:    { cls: 'pay', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`, label: 'gerou um pagamento' },
    order_created:  { cls: 'buy', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, label: 'finalizou um pedido' },
  };

  const showActivityToast = (ev) => {
    const toast = document.getElementById('activity-toast');
    if (!toast) return;
    const info = ACTIVITY_ICONS[ev.type];
    if (!info) return;

    const location = ev.city ? `Cliente de ${ev.city}` : 'Um cliente';
    const el = document.createElement('div');
    el.className = 'act-toast';
    el.innerHTML = `
      <div class="act-toast-icon ${info.cls}">${info.svg}</div>
      <div class="act-toast-text">
        <strong>${location} ${info.label}</strong>
        <span>Agora mesmo</span>
      </div>`;
    toast.appendChild(el);

    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 320);
    }, 5000);
  };

  const startActivityNotifications = (events) => {
    if (!events || !events.length) return;
    let idx = 0;
    const next = () => {
      if (idx < events.length) {
        showActivityToast(events[idx++]);
        if (idx < events.length) setTimeout(next, 8000);
      }
    };
    setTimeout(next, 6000);
  };

  const fetchProductStats = async (productId) => {
    try {
      const res = await fetch(`/api/product-stats/${encodeURIComponent(productId)}`);
      if (!res.ok) return;
      const data = await res.json();

      // ── Urgência: pessoas visualizando agora ──────────────────────────────────
      // Adiciona floor mínimo para sempre mostrar atividade realista
      const viewingNow = Math.max(data.viewingNow || 0, Math.floor(Math.random() * 3) + 2);
      renderUrgencyWidgets(viewingNow, data.views || 0);

      // View counter
      if (data.views > 0) {
        const counterEl = document.getElementById('view-counter');
        const textEl    = document.getElementById('view-counter-text');
        if (counterEl && textEl) {
          textEl.textContent = `${data.views.toLocaleString('pt-BR')} pessoas visualizaram este produto`;
          counterEl.classList.add('visible');
        }
      }

      // Activity notifications (only with real events)
      if (data.recentActivity && data.recentActivity.length) {
        startActivityNotifications(data.recentActivity);
      }
    } catch {}
  };

  // ── Render urgency widgets ────────────────────────────────────────────────────
  const renderUrgencyWidgets = (viewingNow, totalViews) => {
    const container = document.getElementById('urgency-widgets');
    if (!container) return;

    // Estoque simulado: entre 3 e 9, decrementando conforme vendas
    const fakeSales = Math.floor(totalViews / 8) + Math.floor(Math.random() * 5) + 3;
    const fakeStock = Math.max(2, 12 - Math.floor(fakeSales / 4));
    const lowStock  = fakeStock <= 5;

    container.innerHTML = `
      <div class="urgency-bar urgency-viewing">
        <span class="urgency-dot pulse-red"></span>
        <strong>${viewingNow} ${viewingNow === 1 ? 'pessoa visualizando' : 'pessoas visualizando'}</strong> este produto agora
      </div>
      ${lowStock ? `
      <div class="urgency-bar urgency-stock">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <strong>⚡ Restam apenas ${fakeStock} unidades</strong> em estoque
      </div>` : ''}
      <div class="urgency-bar urgency-sales">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
        <strong>${fakeSales} vendas</strong> realizadas nas últimas 24 horas
      </div>`;

    container.classList.add('visible');

    // Anima contador de visualizadores a cada 30s
    setInterval(() => {
      const delta = Math.floor(Math.random() * 3) - 1; // -1, 0 ou +1
      const novo = Math.max(1, viewingNow + delta);
      const viewEl = container.querySelector('.urgency-viewing strong');
      if (viewEl) viewEl.textContent = `${novo} ${novo === 1 ? 'pessoa visualizando' : 'pessoas visualizando'}`;
    }, 30000);
  };

  const fetchProduct = async () => {
    if (!PRODUCT_ID) {
      root.innerHTML = `<div class="empty-state"><p style="font-size:1.1rem;font-weight:600;color:var(--red);">ID do produto não encontrado na URL.</p><a href="index.html" class="btn btn-primary" style="display:inline-flex;margin-top:16px;width:auto;">Voltar à loja</a></div>`;
      return;
    }
    try {
      const [catalogRes, configRes] = await Promise.all([
        fetch(`/api/catalog/product/${PRODUCT_ID}`),
        fetch('/config.json').catch(() => null)
      ]);
      if (!catalogRes.ok) throw new Error('Produto não encontrado');
      const { product, siblings, related } = await catalogRes.json();
      const config = (configRes?.ok) ? await configRes.json() : {};
      const storeDiscount = Math.max(0, Math.min(99, Number(config.descontoPadrao) || 0));

      _catalog = siblings && siblings.length ? siblings : [product];

      const _finalPrice = storeDiscount > 0
        ? Math.round(product.price * (1 - storeDiscount / 100) * 100) / 100
        : (product.price || product.preco || 0);
      window._buyNowProduct = {
        id: product.id,
        nome: product.name || product.nome || 'Produto',
        preco: _finalPrice,
        imagem: Array.isArray(product.images) ? product.images[0] : (product.image || product.imagem || '')
      };

      renderProduct(product, storeDiscount);
      loadRelatedFromData(related || []);
      fetchProductStats(product.id);

      if (window.MetaPixel) {
        var finalPrice = storeDiscount > 0
          ? Math.round(product.price * (1 - storeDiscount / 100) * 100) / 100
          : product.price;
        window.MetaPixel.viewContent({ id: product.id, name: product.name, value: finalPrice });
      }
    } catch (e) {
      root.innerHTML = `<div class="empty-state"><p style="font-size:1.1rem;font-weight:600;color:var(--red);">Erro ao carregar o produto.</p><button class="btn btn-primary" style="display:inline-flex;margin-top:16px;width:auto;" onclick="location.reload()">Tentar novamente</button></div>`;
    }
  };

  fetchProduct();

})();
