/* tracker-beacon.js — visitor tracking for devops dashboard */
(function () {
  'use strict';

  // ── Session ID (tab-scoped) ─────────────────────────────────────────────────
  const KEY = 'jbr_sid';
  let sid = sessionStorage.getItem(KEY);
  if (!sid) {
    sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    sessionStorage.setItem(KEY, sid);
  }

  // ── Client info (collected once) ────────────────────────────────────────────
  const screenW   = window.screen ? window.screen.width  : null;
  const screenH   = window.screen ? window.screen.height : null;
  const language  = navigator.language || null;
  const timezone  = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } })();

  // ── UTM params + paid ad click IDs (persisted in sessionStorage) ───────────
  const SRC_KEY = 'jbr_utm';
  function getUtm() {
    const saved = sessionStorage.getItem(SRC_KEY);
    if (saved) { try { return JSON.parse(saved); } catch {} }
    const p = new URLSearchParams(location.search);
    const utm = {
      utmSource:   p.get('utm_source')   || p.get('ref') || '',
      utmMedium:   p.get('utm_medium')   || '',
      utmCampaign: p.get('utm_campaign') || '',
      utmContent:  p.get('utm_content')  || '',
      utmTerm:     p.get('utm_term')     || '',
      fbclid:      p.get('fbclid')       || '',
      gclid:       p.get('gclid')        || '',
    };
    // Persist if any paid or UTM signal is present
    if (Object.values(utm).some(Boolean)) sessionStorage.setItem(SRC_KEY, JSON.stringify(utm));
    return utm;
  }
  const utm = getUtm();

  // ── Referrer (stored once per session) ──────────────────────────────────────
  const REF_KEY = 'jbr_ref';
  if (!sessionStorage.getItem(REF_KEY)) {
    sessionStorage.setItem(REF_KEY, document.referrer || '');
  }
  const referrer = sessionStorage.getItem(REF_KEY) || '';

  // ── Page + product detection ────────────────────────────────────────────────
  function getPageInfo() {
    const pn     = location.pathname.toLowerCase();
    const params = new URLSearchParams(location.search);
    let page = 'outro';
    if (pn === '/' || pn.endsWith('/index.html') || pn.endsWith('/index')) page = 'inicio';
    else if (pn.includes('product'))    page = 'produto';
    else if (pn.includes('checkout'))   page = 'checkout';
    else if (pn.includes('minha-conta'))page = 'minha-conta';
    else if (pn.includes('meus-pedido'))page = 'pedidos';
    else if (pn.includes('cadastro'))   page = 'cadastro';
    else if (pn.includes('login'))      page = 'login';
    else if (pn.includes('atendimento'))page = 'atendimento';
    else if (pn.includes('faq'))        page = 'faq';
    else if (pn.includes('trocas'))     page = 'trocas';

    const productId = params.get('id') || null;
    let productName = null;
    if (productId) {
      const el = document.querySelector('[data-product-name], h1.product-title, .product-name');
      if (el) productName = el.textContent.trim().slice(0, 80);
      if (!productName) {
        const parts = document.title.split(/[|\-–]/);
        if (parts.length > 1 && parts[0].trim().length > 3) productName = parts[0].trim().slice(0, 80);
      }
    }
    return { page, productId, productName };
  }

  // ── Send heartbeat ──────────────────────────────────────────────────────────
  function send() {
    const { page, productId, productName } = getPageInfo();
    const payload = JSON.stringify({
      sessionId: sid, page, productId, productName,
      referrer, ...utm,
      fbclid: utm.fbclid || null,
      gclid:  utm.gclid  || null,
      screenW, screenH, language, timezone,
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track/heartbeat', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch('/api/track/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(() => {});
      }
    } catch {}
  }

  // ── Send named event ────────────────────────────────────────────────────────
  function sendEvent(type, data) {
    try {
      fetch('/api/track/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, type, data: data || {} }),
        keepalive: true
      }).catch(() => {});
    } catch {}
  }

  // Expose globally so cart.js and other modules can fire events
  window.JBR_track = sendEvent;
  window.JBR_sid   = sid;

  // ── Click event tracking ────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    const el  = e.target;
    const btn = el.closest('button, a, [role=button]') || el;
    const txt = (btn.textContent || btn.value || '').trim();

    // WhatsApp links — check first (highest priority)
    const waLink = el.closest('a[href*="wa.me"], a[href*="whatsapp"]');
    if (waLink) {
      sendEvent('click_whatsapp', { page: location.pathname });
      return;
    }

    // Buy / checkout buttons
    const buyBtn = el.closest('[data-track="buy"], .btn-comprar, .buy-btn');
    if (buyBtn || /^(comprar|compre agora|comprar agora)$/i.test(txt)) {
      sendEvent('click_buy', { page: location.pathname, label: txt.slice(0, 40) });
      return;
    }

    // Finalizar compra / ir para pagamento
    if (el.closest('[data-track="checkout"], #continueBtn') || /finalizar compra|ir para pagamento/i.test(txt)) {
      sendEvent('click_checkout', { page: location.pathname });
      return;
    }

    // Calcular frete
    if (el.closest('#calcBtn, [data-track="calc-frete"]') || /calcular frete|calcular/i.test(txt)) {
      sendEvent('click_calc_frete', { page: location.pathname });
      return;
    }

    // Login / Entrar
    if (el.closest('[data-track="login"], #login-submit, #btn-login') || /^(entrar|fazer login|login)$/i.test(txt)) {
      sendEvent('click_login', { page: location.pathname });
      return;
    }

    // Cadastro
    if (el.closest('[data-track="signup"], #btn-cadastrar') || /^(cadastrar|criar conta|cadastre-se)$/i.test(txt)) {
      sendEvent('click_signup', { page: location.pathname });
      return;
    }

    // PIX copy button
    if (el.closest('[data-track="pix-copy"]') || /copiar.*pix|pix.*copi/i.test(txt)) {
      sendEvent('pix_copy', { page: location.pathname });
    }
  }, { passive: true });

  // ── Initial send ────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(send, 800));
  } else {
    setTimeout(send, 800);
  }

  // Heartbeat every 30s
  setInterval(send, 30_000);

  // Re-send on tab focus
  document.addEventListener('visibilitychange', () => { if (!document.hidden) send(); });
})();
