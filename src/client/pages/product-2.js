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

  window.addToCart = async (productId) => {
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
    } catch {}
  };

  const startChat = async (model) => {
    try {
      const r = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({model, interest:'Quero comprar este produto'}) });
      const data = await r.json();
      window.open(data.url, '_blank');
    } catch { alert('Falha ao iniciar o chat.'); }
  };

  window.buyNow = async (productId) => {
    if (window.Auth && !window.Auth.isLoggedIn()) {
      window.location.href = 'login.html?redirect=' + encodeURIComponent('product.html?id=' + productId);
      return;
    }
    await window.addToCart(productId);
    if (typeof window._showTypingMessage === 'function') {
      window._showTypingMessage('Produto adicionado! Indo para o carrinho...', () => {
        window.location.href = 'cart.html';
      });
    } else {
      window.location.href = 'cart.html';
    }
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

    const heroImg    = document.getElementById('hero-img');
    const thumbsEl   = document.getElementById('gallery-thumbs');

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
      if (heroImg) heroImg.src = images[current];
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
      current = 0;
      if (heroImg) heroImg.src = images[0];
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

  const setupLazyReviews = (reviewsList) => {
    const section = document.getElementById('reviews-lazy-section');
    if (!section || !reviewsList?.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        section.innerHTML = reviewsList.map(rv => `
          <div class="review-item">
            <div class="review-item-header">
              ${starsHtml(rv.rating)}
              <span class="review-date">${rv.date || ''}</span>
            </div>
            <p class="review-text">${rv.text || ''}</p>
            ${rv.images?.length ? `<div class="review-photos">${rv.images.map(img => `<img src="${img}" alt="Foto da avaliação" loading="lazy" onclick="openLightbox('${img}')">`).join('')}</div>` : ''}
          </div>`).join('');
      });
    }, { threshold: 0.1 });
    observer.observe(section);
  };

  const loadRelatedFromData = (others) => {
    const container = document.getElementById('related-container');
    if (!container) return;
    try {
      if (!others.length) { container.closest('.section').remove(); return; }
      container.innerHTML = others.map(p => {
        const img = (Array.isArray(p.images) ? p.images : []).find(s =>
          typeof s === 'string' && s.startsWith('http')
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
    const isValidImg = (s) => typeof s === 'string' && s.startsWith('http');

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
              ${(product.reviews||0) > 0 ? `<span class="badge-sold">+${Math.floor((product.reviews||0)/10)*10} vendidos</span>` : ''}
            </div>
            <h1 class="product-name">${product.name}</h1>
            <div class="rating-row">
              ${starsHtml(product.rating || 5, '.95rem')}
              <span class="rating-val">${(product.rating||5).toFixed(1)}</span>
              <span class="rating-count">(${(product.reviews||0).toLocaleString('pt-BR')} avaliações)</span>
            </div>
            <div class="seller-row">
              Vendido por <strong>${product.seller || 'jessi.iphones'}</strong>
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
              <button class="btn btn-secondary" onclick="buyNow('${product.id}')">
                ${IC.buy} Comprar Agora
              </button>
              <button class="btn btn-ml-add" onclick="addToCart('${product.id}')">
                ${IC.cart} Adicionar ao Carrinho
              </button>
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
        <div class="reviews-list" id="reviews-lazy-section">
          ${reviewsList.length === 0
            ? '<p class="reviews-placeholder">Nenhuma avaliação textual disponível ainda.</p>'
            : '<p class="reviews-placeholder" style="padding:12px 0;">Carregando avaliações...</p>'}
        </div>
      </section>

      ${customerImgs.length ? `
      <section class="section" aria-labelledby="gallery-title">
        <h2 class="section-title" id="gallery-title">Fotos dos compradores</h2>
        <div class="customer-gallery-grid">
          ${customerImgs.map((img, i) => `<img src="${img}" alt="Foto do comprador ${i+1}" loading="lazy" onclick="openLightbox('${img}')">`).join('')}
        </div>
      </section>` : ''}

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

    const isValidImg = (s) => typeof s === 'string' && s.startsWith('http');

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
        b.setAttribute('onclick', `buyNow('${p.id}')`));
      document.querySelectorAll('[onclick*="addToCart("]').forEach(b =>
        b.setAttribute('onclick', `addToCart('${p.id}')`));

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

      renderProduct(product, storeDiscount);
      loadRelatedFromData(related || []);
    } catch (e) {
      root.innerHTML = `<div class="empty-state"><p style="font-size:1.1rem;font-weight:600;color:var(--red);">Erro ao carregar o produto.</p><button class="btn btn-primary" style="display:inline-flex;margin-top:16px;width:auto;" onclick="location.reload()">Tentar novamente</button></div>`;
    }
  };

  fetchProduct();

})();
