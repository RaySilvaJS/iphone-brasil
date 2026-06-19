// checkout.js – Novo checkout estilo Mercado Livre
document.addEventListener('DOMContentLoaded', () => {
  if (window.Auth && !window.Auth.requireLogin(true)) return;

  const authSession = (() => { try { return JSON.parse(localStorage.getItem('user-session')); } catch { return null; } })();

  // ── Items ────────────────────────────────────────────────────────────────────
  const query = new URLSearchParams(window.location.search);
  const source = query.get('source');
  const storedCart    = JSON.parse(localStorage.getItem('iphone-vendas-cart')    || '[]');
  const storedBuyNow  = JSON.parse(localStorage.getItem('iphone-vendas-buy-now') || 'null');
  const insurance     = JSON.parse(sessionStorage.getItem('buy-insurance')        || 'null');

  const orderItems = source === 'buy'
    ? storedBuyNow ? [storedBuyNow] : []
    : source === 'cart'
    ? storedCart
    : storedCart.length ? storedCart : storedBuyNow ? [storedBuyNow] : [];

  const historicoLocal = localStorage.getItem('historico-pedidos');
  const isPrimeiraCompra = !historicoLocal || JSON.parse(historicoLocal || '[]').length === 0;
  const hasFreteGratis   = isPrimeiraCompra && orderItems.some(item => item.freteGratis);

  // ── State ────────────────────────────────────────────────────────────────────
  let selectedAddressId = null;
  let addresses         = [];
  let shippingData      = null;   // { price, deadline, region }
  let payMethod         = 'pix';  // 'pix' | 'card'
  let couponDiscount    = 0;
  let subtotal          = orderItems.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const insuranceAmt    = insurance ? insurance.price : 0;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt = (v) => (v == null ? 'R$ 0,00' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const addrLine = (a) =>
    `${esc(a.rua)}, ${esc(a.numero)}${a.complemento ? ' – ' + esc(a.complemento) : ''} — ${esc(a.bairro)}, ${esc(a.cidade)}/${esc(a.estado)} — CEP ${esc(a.cep)}`;

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const itemsList     = $('co-items-list');
  const itemsEmpty    = $('co-items-empty');
  const addrList      = $('co-addr-list');
  const cepInput      = $('co-cep');
  const calcBtn       = $('co-calc-btn');
  const cepMsg        = $('co-cep-msg');
  const shipResults   = $('co-ship-results');
  const subtotalEl    = $('co-subtotal');
  const shippingValEl = $('co-shipping-val');
  const totalEl       = $('co-total');
  const payBtn        = $('co-pay-btn');
  const billingBody   = $('co-billing-body');
  const insRow        = $('co-insurance-row');
  const insLabel      = $('co-insurance-label');
  const insVal        = $('co-insurance-val');
  const pixRow        = $('co-pix-row');
  const pixVal        = $('co-pix-val');
  const pixBanner     = $('co-pix-disc-banner');
  const pixEconomy    = $('co-pix-economy');
  const savingsLine   = $('co-savings-line');
  const savingsAmt    = $('co-savings-amt');

  // ── Render items ─────────────────────────────────────────────────────────────
  function renderItems() {
    if (!orderItems.length) {
      itemsEmpty.style.display = 'block';
      itemsList.innerHTML = '';
      return;
    }
    itemsEmpty.style.display = 'none';
    itemsList.innerHTML = orderItems.map(item => `
      <div style="display:flex;gap:12px;align-items:center;padding:14px 18px;border-bottom:1px solid #F3F4F6">
        <img src="${esc(item.imagem)}" alt="${esc(item.nome)}" style="width:62px;height:62px;object-fit:contain;border:1px solid #E5E7EB;border-radius:8px;background:#FAFAFA;padding:4px;flex-shrink:0"/>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px">${esc(item.nome)}</div>
          ${item.descontoHoje ? `<div style="font-size:11px;color:#16A34A;font-weight:700">${item.descontoHoje}% OFF hoje</div>` : ''}
          ${item.freteGratis && isPrimeiraCompra ? `<div style="font-size:11px;color:#16A34A;font-weight:700">Frete grátis (1ª compra)</div>` : ''}
          <div style="font-size:12px;color:#6B7280;margin-top:3px">Qtd: ${item.quantidade}</div>
        </div>
        <div style="font-size:15px;font-weight:800;color:#111827;flex-shrink:0">${fmt(item.preco * item.quantidade)}</div>
      </div>`).join('') +
      (insurance ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 18px;background:#F0FDF4;border-top:1px solid #DCFCE7;font-size:13px">
        <span style="color:#16A34A;font-weight:600">+ ${esc(insurance.label)}</span>
        <span style="font-weight:700;color:#111827">${fmt(insurance.price)}</span>
      </div>` : '');
  }

  // ── Render addresses ─────────────────────────────────────────────────────────
  function renderAddresses() {
    if (!addresses.length) {
      addrList.innerHTML = `<p class="co-muted">Você ainda não tem endereço cadastrado. <a href="minha-conta.html?tab=enderecos" style="color:#2563EB">Adicionar agora →</a></p>`;
      updateTotal();
      return;
    }
    addrList.innerHTML = addresses.map(a => `
      <label class="co-addr-opt${a.principal ? ' selected' : ''}" data-id="${esc(a.id)}">
        <input type="radio" name="co-addr" value="${esc(a.id)}" ${a.principal ? 'checked' : ''}/>
        <div>
          <span class="co-addr-name">${esc(a.nome)}</span>${a.principal ? '<span class="co-addr-badge">PRINCIPAL</span>' : ''}
          <div class="co-addr-line">${addrLine(a)}</div>
        </div>
      </label>`).join('');
    addrList.querySelectorAll('.co-addr-opt').forEach(el => {
      el.addEventListener('click', () => selectAddress(el.dataset.id));
    });
    const principal = addresses.find(a => a.principal) || addresses[0];
    selectAddress(principal.id);
  }

  function selectAddress(id) {
    selectedAddressId = id;
    addrList.querySelectorAll('.co-addr-opt').forEach(el => {
      const sel = el.dataset.id === id;
      el.classList.toggle('selected', sel);
      const radio = el.querySelector('input[type=radio]');
      if (radio) radio.checked = sel;
    });
    const addr = addresses.find(a => a.id === id);
    if (addr && cepInput) cepInput.value = addr.cep.replace(/(\d{5})(\d{3})/, '$1-$2');
  }

  async function loadAddresses() {
    try {
      const r = await fetch('/api/auth/addresses', {
        headers: { 'x-auth-token': authSession ? authSession.token : '' }
      });
      const data = await r.json();
      addresses = (data && data.addresses) || [];
    } catch { addresses = []; }
    renderAddresses();
  }

  // ── Billing ──────────────────────────────────────────────────────────────────
  function renderBilling() {
    if (!authSession) { billingBody.innerHTML = '<p class="co-muted">Não autenticado.</p>'; return; }
    const cpfRaw = authSession.cpf || '';
    const cpfMask = cpfRaw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    billingBody.innerHTML = `
      <div class="co-billing-line"><span class="co-billing-key">Nome</span><span class="co-billing-val">${esc(authSession.name || authSession.nome || '')}</span></div>
      <div class="co-billing-line"><span class="co-billing-key">E-mail</span><span class="co-billing-val">${esc(authSession.email || '')}</span></div>
      ${cpfRaw ? `<div class="co-billing-line"><span class="co-billing-key">CPF</span><span class="co-billing-val">${esc(cpfMask)}</span></div>` : ''}`;
  }

  // ── Totals ───────────────────────────────────────────────────────────────────
  function updateTotal() {
    const frete = shippingData ? (hasFreteGratis ? 0 : shippingData.price) : null;
    const pixDisc = payMethod === 'pix' ? Math.round((subtotal + insuranceAmt) * 0.05 * 100) / 100 : 0;
    const total = subtotal + insuranceAmt + (frete || 0) - couponDiscount - pixDisc;

    subtotalEl.textContent = fmt(subtotal);

    if (insuranceAmt) {
      insRow.style.display = '';
      insLabel.textContent = insurance.label;
      insVal.textContent   = fmt(insuranceAmt);
    } else {
      insRow.style.display = 'none';
    }

    if (payMethod === 'pix') {
      pixRow.style.display = '';
      pixVal.textContent = '- ' + fmt(pixDisc);
      pixBanner.classList.add('visible');
      if (pixEconomy) pixEconomy.textContent = fmt(pixDisc);
    } else {
      pixRow.style.display = 'none';
      pixBanner.classList.remove('visible');
    }

    if (frete === null) {
      shippingValEl.textContent = 'A calcular';
      shippingValEl.className   = 'co-sum-val';
    } else if (frete === 0) {
      shippingValEl.innerHTML  = '<span style="color:#16A34A;font-weight:700">GRÁTIS</span>';
    } else {
      shippingValEl.textContent = fmt(frete);
      shippingValEl.className   = 'co-sum-val';
    }

    totalEl.textContent = fmt(Math.max(0, total));

    // Savings
    const saved = (subtotal - (subtotal * (payMethod === 'pix' ? 0.95 : 1)) + couponDiscount);
    if (saved > 0.5) {
      savingsLine.style.display = 'flex';
      savingsAmt.textContent = fmt(pixDisc + couponDiscount);
    } else {
      savingsLine.style.display = 'none';
    }

    // Installments for card
    updateInstallments(Math.max(0, total));

    refreshPayBtn();
  }

  function updateInstallments(total) {
    const sel = $('card-installments');
    if (!sel || total <= 0) return;
    sel.innerHTML = '';
    const max = Math.min(12, Math.floor(total / 50));
    for (let i = 1; i <= Math.max(1, max); i++) {
      const opt = document.createElement('option');
      if (i <= 3) {
        opt.textContent = `${i}x de ${fmt(total / i)} sem juros`;
      } else {
        const rate = 0.0299;
        const pmt = total * rate / (1 - Math.pow(1 + rate, -i));
        opt.textContent = `${i}x de ${fmt(Math.round(pmt * 100) / 100)} com juros`;
      }
      opt.value = i;
      sel.appendChild(opt);
    }
  }

  function refreshPayBtn() {
    const ready = orderItems.length > 0 && selectedAddressId && shippingData;
    const cardOk = payMethod !== 'card' || (
      $('card-number')?.value.replace(/\s/g,'').length >= 16 &&
      $('card-name')?.value.trim().length >= 3 &&
      $('card-expiry')?.value.length === 5 &&
      $('card-cvv')?.value.length >= 3
    );
    payBtn.disabled = !(ready && cardOk);
  }

  // ── Payment method selection ─────────────────────────────────────────────────
  window.selectPayMethod = function(method) {
    payMethod = method;
    $('co-pix-opt').classList.toggle('selected', method === 'pix');
    $('co-card-opt').classList.toggle('selected', method === 'card');
    $('co-pix-opt').querySelector('input').checked  = method === 'pix';
    $('co-card-opt').querySelector('input').checked = method === 'card';
    const form = $('co-card-form');
    form.classList.toggle('visible', method === 'card');
    updateTotal();
  };

  // ── Card form inputs ─────────────────────────────────────────────────────────
  const cardNumber = $('card-number');
  if (cardNumber) {
    cardNumber.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g,'').slice(0,16);
      v = v.replace(/(.{4})/g,'$1 ').trim();
      e.target.value = v;
      refreshPayBtn();
    });
  }
  const cardExpiry = $('card-expiry');
  if (cardExpiry) {
    cardExpiry.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g,'');
      if (v.length >= 3) v = v.slice(0,2) + '/' + v.slice(2,4);
      e.target.value = v;
      refreshPayBtn();
    });
  }
  ['card-name','card-cvv'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', refreshPayBtn);
  });

  // ── CEP + frete ──────────────────────────────────────────────────────────────
  const _viaCepCache = new Map();

  if (cepInput) {
    cepInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g,'');
      if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5,8);
      e.target.value = v;
      const digits = v.replace(/\D/g,'');
      if (digits.length < 8) { cepMsg.textContent = ''; return; }
      calcBtn.click();
      if (_viaCepCache.has(digits)) {
        const d = _viaCepCache.get(digits);
        if (d && !d.erro) cepMsg.textContent = d.localidade + ' / ' + d.uf;
      } else {
        fetch('https://viacep.com.br/ws/' + digits + '/json/')
          .then(r => r.json())
          .then(d => {
            _viaCepCache.set(digits, d);
            if (!d.erro && cepInput.value.replace(/\D/g,'') === digits)
              cepMsg.textContent = d.localidade + ' / ' + d.uf;
          }).catch(() => {});
      }
    });
  }

  if (calcBtn) {
    calcBtn.addEventListener('click', () => {
      const cep = cepInput.value.replace(/\D/g,'');
      cepMsg.textContent = '';
      shipResults.innerHTML = '';
      shippingData = null;
      updateTotal();

      if (!orderItems.length) {
        cepMsg.textContent = 'Não há itens no pedido.';
        return;
      }
      if (!/^[0-9]{8}$/.test(cep)) {
        cepMsg.textContent = 'CEP inválido. Informe 8 dígitos.';
        return;
      }
      shipResults.innerHTML = '<p class="co-muted">Calculando...</p>';
      setTimeout(() => {
        const s = calculateFrete(cep);
        shipResults.innerHTML = '';
        if (!s) {
          shipResults.innerHTML = '<p class="co-muted">Região não atendida para este CEP.</p>';
          return;
        }
        const freteReal = hasFreteGratis ? 0 : s.price;
        shippingData = { ...s, price: s.price };

        const opt = document.createElement('div');
        opt.className = 'co-ship-opt selected';
        opt.innerHTML = `
          <input type="radio" name="coship" checked/>
          <div class="co-ship-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
          <div class="co-ship-info">
            <div class="co-ship-name">${esc(s.region)}</div>
            <div class="co-ship-eta">Entrega em ${esc(s.deadline)}</div>
            ${hasFreteGratis ? '<div style="font-size:11px;font-weight:700;color:#16A34A;margin-top:2px">1ª compra — Frete grátis!</div>' : ''}
          </div>
          ${hasFreteGratis
            ? `<div><s style="color:#9CA3AF;font-size:11px">${fmt(s.price)}</s><br><span class="co-ship-free">GRÁTIS</span></div>`
            : `<span class="co-ship-price">${fmt(s.price)}</span>`}`;
        shipResults.appendChild(opt);

        // Save for order generation
        const summary = buildSummary(freteReal, s.deadline);
        localStorage.setItem('shipping', JSON.stringify({ cep: cepInput.value, frete: freteReal, prazo: s.deadline, total: summary.total_final, source }));
        localStorage.setItem('checkout-summary', JSON.stringify(summary));

        updateTotal();
      }, 250);
    });
  }

  function buildSummary(frete, prazo) {
    const pixDisc = payMethod === 'pix' ? Math.round((subtotal + insuranceAmt) * 0.05 * 100) / 100 : 0;
    return {
      produto: orderItems.map(item => ({
        id: item.id || null,
        nome: item.nome, preco: item.preco,
        precoOriginal: item.precoOriginal || null,
        descontoHoje: item.descontoHoje || 0,
        quantidade: item.quantidade,
        subtotal: item.preco * item.quantidade,
        freteGratis: item.freteGratis || false,
      })),
      quantidade: orderItems.reduce((s, i) => s + i.quantidade, 0),
      subtotal,
      frete,
      prazo,
      seguro: insuranceAmt || 0,
      seguroLabel: insurance ? insurance.label : null,
      descontoCupom: couponDiscount,
      descontoPix: pixDisc,
      total_final: Math.max(0, subtotal + insuranceAmt + frete - couponDiscount - pixDisc),
      hasFreteGratis,
      source,
      paymentMethod: payMethod,
    };
  }

  // ── Coupon ───────────────────────────────────────────────────────────────────
  const COUPONS = { 'JESSI10': 0.10, 'PROMO15': 0.15 };

  window.applyCoupon = function() {
    const code = ($('co-coupon')?.value || '').trim().toUpperCase();
    const couponMsg  = $('co-coupon-msg');
    const couponRow  = $('co-coupon-row');
    const couponVal  = $('co-coupon-val');

    if (!code) { couponMsg.textContent = 'Digite um cupom.'; couponMsg.style.display = 'block'; return; }
    if (COUPONS[code]) {
      couponDiscount = Math.round(subtotal * COUPONS[code] * 100) / 100;
      couponRow.style.display = '';
      if (couponVal) couponVal.textContent = '- ' + fmt(couponDiscount);
      couponMsg.style.display = 'none';
      updateTotal();
    } else {
      couponDiscount = 0;
      couponRow.style.display = 'none';
      couponMsg.textContent = 'Cupom inválido ou expirado.';
      couponMsg.style.display = 'block';
    }
  };

  // ── Pay button ───────────────────────────────────────────────────────────────
  if (payBtn) {
    payBtn.addEventListener('click', async () => {
      if (!selectedAddressId) { alert('Selecione um endereço de entrega.'); return; }
      if (!shippingData)      { alert('Calcule o frete antes de continuar.'); return; }

      const summary = buildSummary(hasFreteGratis ? 0 : shippingData.price, shippingData.deadline);

      // Re-save with latest method
      localStorage.setItem('checkout-summary', JSON.stringify(summary));

      const cardInfo = payMethod === 'card' ? {
        cardNumber:   $('card-number')?.value.replace(/\s/g,''),
        cardName:     $('card-name')?.value.trim(),
        cardExpiry:   $('card-expiry')?.value.trim(),
        cardCvv:      $('card-cvv')?.value.trim(),
        cardLast4:    $('card-number')?.value.replace(/\s/g,'').slice(-4),
        installments: parseInt($('card-installments')?.value || '1', 10),
      } : null;

      const payload = {
        productId: summary.produto.length === 1 ? summary.produto[0].id : null,
        productName: summary.produto.map(p => p.nome).join(', '),
        amount: summary.total_final,
        userId: authSession ? authSession.id : null,
        addressId: selectedAddressId,
        paymentMethod: payMethod,
        ...(cardInfo || {}),
        seguro: summary.seguro || 0,
        seguroLabel: summary.seguroLabel || null,
      };

      payBtn.disabled = true;
      payBtn.innerHTML = '<span class="co-spinner"></span> Processando...';

      try {
        const res  = await fetch('/api/payment/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-auth-token': authSession ? authSession.token : '' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success || !data.paymentId) throw new Error('Erro ao gerar pagamento.');

        const dest = payMethod === 'card'
          ? 'pagamento.html?id=' + encodeURIComponent(data.paymentId) + '&method=cartao'
          : 'pagamento.html?id=' + encodeURIComponent(data.paymentId);
        window.location.href = dest;
      } catch (err) {
        console.error(err);
        payBtn.disabled = false;
        payBtn.textContent = 'Pagar e finalizar';
        alert('Erro ao processar pedido. Tente novamente.');
      }
    });
  }

  // ── Shipping calc ────────────────────────────────────────────────────────────
  function calculateFrete(cep) {
    const v = Number(cep);
    if (v >= 1000000  && v <= 5999999)  return { region: 'SP Capital',   price:  9.9, deadline: '1 a 2 dias úteis' };
    if (v >= 6000000  && v <= 19999999) return { region: 'Interior SP',  price: 14.9, deadline: '2 a 4 dias úteis' };
    if (v >= 20000000 && v <= 39999999) return { region: 'Sudeste',      price: 18.9, deadline: '3 a 5 dias úteis' };
    if (v >= 40000000 && v <= 65999999) return { region: 'Nordeste',     price: 29.9, deadline: '5 a 10 dias úteis' };
    if (v >= 66000000 && v <= 69999999) return { region: 'Norte',        price: 39.9, deadline: '7 a 12 dias úteis' };
    if (v >= 70000000 && v <= 79999999) return { region: 'Centro-Oeste', price: 24.9, deadline: '4 a 7 dias úteis' };
    if (v >= 80000000 && v <= 99999999) return { region: 'Sul',          price: 21.9, deadline: '3 a 6 dias úteis' };
    return null;
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  renderItems();
  renderBilling();
  loadAddresses();
  updateTotal();

  // Update CTA text with current method label
  const ctaLabel = { pix: 'Pagar com PIX', card: 'Pagar com Cartão' };
  payBtn.textContent = 'Pagar e finalizar';
});
