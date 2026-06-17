/* tracker-beacon.js — anonymous visitor tracking for devops dashboard */
(function () {
  'use strict';

  // Session ID: tab-scoped (new tab = new session)
  const KEY = 'jbr_sid';
  let sid = sessionStorage.getItem(KEY);
  if (!sid) {
    sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    sessionStorage.setItem(KEY, sid);
  }

  // Traffic source from URL params or referrer (captured once per session)
  const SRC_KEY = 'jbr_src';
  function detectSource() {
    const saved = sessionStorage.getItem(SRC_KEY);
    if (saved) return saved;
    const p = new URLSearchParams(location.search);
    const utm = p.get('utm_source') || p.get('ref') || '';
    if (utm) { sessionStorage.setItem(SRC_KEY, utm); return utm; }
    const ref = document.referrer || '';
    sessionStorage.setItem(SRC_KEY, ref);
    return ref;
  }
  const utmSource = new URLSearchParams(location.search).get('utm_source') || new URLSearchParams(location.search).get('ref') || '';
  const referrer = sessionStorage.getItem(SRC_KEY) || document.referrer || '';

  // Page + product detection
  function getPageInfo() {
    const pn = location.pathname.toLowerCase();
    const params = new URLSearchParams(location.search);
    let page = 'outro';
    if (pn === '/' || pn.endsWith('/index.html') || pn.endsWith('/index')) page = 'inicio';
    else if (pn.includes('product')) page = 'produto';
    else if (pn.includes('checkout')) page = 'checkout';
    else if (pn.includes('minha-conta')) page = 'minha-conta';
    else if (pn.includes('meus-pedidos')) page = 'pedidos';
    else if (pn.includes('cadastro')) page = 'cadastro';
    else if (pn.includes('login')) page = 'login';
    else if (pn.includes('atendimento')) page = 'atendimento';
    else if (pn.includes('faq')) page = 'faq';
    else if (pn.includes('trocas')) page = 'trocas';

    const productId = params.get('id') || null;
    // Try to get product name from DOM (may not be ready on first call)
    let productName = null;
    if (productId) {
      const el = document.querySelector('[data-product-name], h1.product-title, .product-name');
      if (el) productName = el.textContent.trim().slice(0, 80);
      if (!productName) {
        const title = document.title;
        const parts = title.split(/[|\-–]/);
        if (parts.length > 1 && parts[0].trim().length > 3) productName = parts[0].trim().slice(0, 80);
      }
    }
    return { page, productId, productName };
  }

  function send() {
    detectSource();
    const { page, productId, productName } = getPageInfo();
    const payload = JSON.stringify({
      sessionId: sid, page, productId, productName,
      referrer, utmSource
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track/heartbeat', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch('/api/track/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
      }
    } catch {}
  }

  // Send on load (slight delay so product name might be in DOM)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(send, 800));
  } else {
    setTimeout(send, 800);
  }

  // Heartbeat every 30s
  setInterval(send, 30_000);

  // Re-send on tab focus (updates "last active")
  document.addEventListener('visibilitychange', () => { if (!document.hidden) send(); });
})();
