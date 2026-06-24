/* coupon-modal.js — promotional coupon modal shown before "Comprar Agora" */
(function () {
  'use strict';

  const SHOWN_KEY   = 'jessi-coupon-shown';
  const APPLIED_KEY = 'jessi-coupon';
  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  let _cachedCoupon = undefined; // undefined = not fetched yet; null = none available
  let _fetchPromise = null;

  function prefetch() {
    if (_fetchPromise) return _fetchPromise;
    _fetchPromise = fetch('/api/coupons/active')
      .then(r => r.ok ? r.json() : null)
      .then(d => { _cachedCoupon = d || null; return _cachedCoupon; })
      .catch(() => { _cachedCoupon = null; return null; });
    return _fetchPromise;
  }

  function getApplied() {
    try { return JSON.parse(sessionStorage.getItem(APPLIED_KEY) || 'null'); } catch { return null; }
  }
  function setApplied(c) {
    try { sessionStorage.setItem(APPLIED_KEY, JSON.stringify(c)); } catch {}
  }
  function removeApplied() {
    try { sessionStorage.removeItem(APPLIED_KEY); } catch {}
  }

  function shouldShow() {
    if (getApplied()) return false;
    if (sessionStorage.getItem(SHOWN_KEY)) return false;
    return true;
  }

  function calcDiscount(coupon, price) {
    if (!coupon) return 0;
    if (coupon.type === 'percent' || coupon.type === 'pix_extra') {
      return Math.round(price * coupon.value / 100 * 100) / 100;
    }
    if (coupon.type === 'fixed') return Math.min(coupon.value, price);
    return 0; // free_shipping etc.
  }

  function show(product, onProceed) {
    const applied = getApplied();
    if (applied) { onProceed(applied); return; }
    if (!shouldShow()) { onProceed(null); return; }

    try { sessionStorage.setItem(SHOWN_KEY, '1'); } catch {}

    const run = (coupon) => {
      if (!coupon) { onProceed(null); return; }
      const price = Number(product.preco || product.price) || 0;
      if (coupon.minValue && price < coupon.minValue) { onProceed(null); return; }
      const discount   = calcDiscount(coupon, price);
      const isFreeShip = coupon.type === 'free_shipping';
      if (discount <= 0 && !isFreeShip) { onProceed(null); return; }
      _render(product, coupon, price, discount, isFreeShip, onProceed);
    };

    if (_cachedCoupon !== undefined) {
      run(_cachedCoupon);
    } else {
      prefetch().then(run);
    }
  }

  function _render(product, coupon, price, discount, isFreeShip, onProceed) {
    document.getElementById('__cm')?.remove();

    const img  = product.imagem || (Array.isArray(product.images) ? product.images[0] : '') || '';
    const name = product.nome || product.name || 'Produto';
    const isPix = coupon.paymentMethod === 'pix' || coupon.type === 'pix_extra';
    const pctLabel = coupon.type === 'percent' || coupon.type === 'pix_extra'
      ? coupon.value + '%'
      : (coupon.value ? fmt(coupon.value) : '');

    const ov = document.createElement('div');
    ov.id = '__cm';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(90,35,53,.62);z-index:99990;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);';

    ov.innerHTML = `
      <style>
        @keyframes __cmup{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes __cmspin{to{transform:rotate(360deg)}}
        #__cmbox{animation:__cmup .32s cubic-bezier(.2,0,.2,1);width:100%;max-width:480px;background:#fff;border-radius:24px 24px 0 0;padding:28px 20px 28px;position:relative;max-height:92vh;overflow-y:auto;}
        @media(min-width:560px){#__cm{align-items:center;}#__cmbox{border-radius:20px;max-width:440px;}}
        #__cmcode{font-family:monospace;font-size:1.55rem;font-weight:900;letter-spacing:.18em;color:#5A2335;background:linear-gradient(135deg,#FCE7EF,#f9d5e2);border:2.5px dashed #D96B8A;border-radius:12px;padding:12px 20px;text-align:center;user-select:all;margin:14px 0;}
        #__cmbtn{display:block;width:100%;padding:16px;background:linear-gradient(135deg,#D96B8A,#5A2335);color:#fff;border:none;border-radius:14px;font-size:1rem;font-weight:800;cursor:pointer;margin-top:14px;transition:opacity .15s;}
        #__cmbtn:hover:not(:disabled){opacity:.9;}
        #__cmbtn:disabled{opacity:.65;cursor:default;}
        #__cmskip{display:block;width:100%;padding:10px;background:none;border:none;color:#94A3B8;font-size:.85rem;cursor:pointer;font-weight:500;text-decoration:underline;margin-top:6px;}
        #__cmskip:hover{color:#475569;}
        #__cmclose{position:absolute;top:14px;right:14px;background:#FDF4F7;border:none;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:#5A2335;font-weight:900;line-height:1;}
        .__cmsp{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:__cmspin .65s linear infinite;vertical-align:middle;margin-right:6px;}
      </style>
      <div id="__cmbox">
        <button id="__cmclose" aria-label="Fechar">✕</button>

        <div style="text-align:center;">
          ${img ? `<img src="${img}" alt="${name}" style="width:70px;height:70px;object-fit:contain;border-radius:12px;border:1px solid #F3C5D0;padding:6px;background:#FDF4F7;display:block;margin:0 auto 12px;">` : ''}
          <div style="font-size:1.7rem;margin-bottom:4px;">🎁</div>
          <h2 style="font-size:1.15rem;font-weight:800;color:#5A2335;margin:0 0 6px;">Tem desconto exclusivo pra você!</h2>
          <p style="font-size:.875rem;color:#475569;margin:0 0 4px;">${coupon.description || 'Aplique o cupom antes de finalizar e economize!'}</p>
        </div>

        <div id="__cmcode">${coupon.code}</div>

        ${isPix ? `<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:8px 12px;font-size:.8rem;color:#1D4ED8;font-weight:600;text-align:center;margin-bottom:10px;">⚡ Válido somente para pagamento via PIX</div>` : ''}

        ${discount > 0 ? `
        <div style="background:#FDF4F7;border-radius:12px;padding:14px 16px;margin:10px 0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="color:#475569;font-size:.875rem;">Preço do produto</span>
            <s style="color:#94A3B8;font-size:.875rem;">${fmt(price)}</s>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="color:#16A34A;font-size:.875rem;font-weight:700;">Desconto (${pctLabel})</span>
            <span style="color:#16A34A;font-size:.875rem;font-weight:700;">−${fmt(discount)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px dashed #F3C5D0;padding-top:8px;">
            <strong style="color:#0F172A;font-size:.9rem;">Com cupom</strong>
            <strong style="color:#16A34A;font-size:1.1rem;">${fmt(price - discount)}</strong>
          </div>
        </div>
        <div style="text-align:center;font-size:.85rem;font-weight:600;color:#16A34A;background:#F0FDF4;border-radius:8px;padding:7px;margin-bottom:4px;">💚 Você economiza ${fmt(discount)} nesta compra!</div>
        ` : isFreeShip ? `
        <div style="background:#F0FDF4;border-radius:12px;padding:14px 16px;margin:10px 0;text-align:center;">
          <div style="font-size:1.3rem;margin-bottom:4px;">🚚</div>
          <strong style="color:#16A34A;font-size:1rem;">Frete Grátis incluso</strong>
          <p style="color:#475569;font-size:.85rem;margin:4px 0 0;">Este cupom dá frete grátis no seu pedido!</p>
        </div>
        ` : ''}

        <button id="__cmbtn">${isFreeShip ? '🚚 Aplicar frete grátis e comprar' : discount > 0 ? `Usar cupom · pagar ${fmt(price - discount)}` : 'Aplicar cupom'}</button>
        <button id="__cmskip">Continuar sem desconto</button>
      </div>
    `;

    document.body.appendChild(ov);

    const close = (withCoupon, appliedData) => {
      ov.style.opacity = '0';
      ov.style.transition = 'opacity .2s';
      setTimeout(() => ov.remove(), 220);
      if (withCoupon && appliedData) {
        setApplied(appliedData);
        onProceed(appliedData);
      } else {
        onProceed(null);
      }
    };

    document.getElementById('__cmclose').addEventListener('click', () => close(false));
    document.getElementById('__cmskip').addEventListener('click',  () => close(false));
    ov.addEventListener('click', (e) => { if (e.target === ov) close(false); });

    document.getElementById('__cmbtn').addEventListener('click', async () => {
      const btn = document.getElementById('__cmbtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="__cmsp"></span>Validando cupom...';
      try {
        const r = await fetch('/api/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: coupon.code, amount: price }),
        });
        const data = await r.json();
        if (data.success || data.valid) {
          btn.innerHTML = '✓ Cupom aplicado!';
          btn.style.background = '#16A34A';
          const saved = {
            code: coupon.code,
            type: coupon.type,
            value: coupon.value,
            discount: data.discount || discount,
            freeShipping: data.freeShipping || isFreeShip,
            paymentMethod: coupon.paymentMethod || null,
          };
          setTimeout(() => close(true, saved), 700);
        } else {
          btn.textContent = data.error || 'Cupom inválido — tente outro';
          btn.style.background = '#94A3B8';
          setTimeout(() => close(false), 1800);
        }
      } catch {
        // Network error → apply optimistically
        btn.innerHTML = '✓ Cupom aplicado!';
        btn.style.background = '#16A34A';
        const saved = {
          code: coupon.code, type: coupon.type, value: coupon.value,
          discount, freeShipping: isFreeShip, paymentMethod: coupon.paymentMethod || null,
        };
        setTimeout(() => close(true, saved), 700);
      }
    });
  }

  window.CouponModal = { prefetch, show, getApplied, removeApplied, shouldShow };

  // Prefetch 2 seconds after page load so the coupon is cached when user clicks Buy
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(prefetch, 2000));
  } else {
    setTimeout(prefetch, 2000);
  }
})();
