// checkout.js - front-end logic for calculating and selecting shipping
document.addEventListener('DOMContentLoaded', () => {
  // Compra exige login - sem sessão válida, volta para o login e retorna aqui depois
  if (window.Auth && !window.Auth.requireLogin(true)) return;

  const authSession = (function () {
    try { return JSON.parse(localStorage.getItem('user-session')); } catch (e) { return null; }
  })();

  const addressCardBody = document.getElementById('address-card-body');
  const sumAddrWrap = document.getElementById('sum-addr-wrap');
  let addresses = [];
  let selectedAddressId = null;

  function escapeAddr(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function addressLine(a) {
    return `${escapeAddr(a.rua)}, ${escapeAddr(a.numero)}${a.complemento ? ' - ' + escapeAddr(a.complemento) : ''} — ${escapeAddr(a.bairro)}, ${escapeAddr(a.cidade)}/${escapeAddr(a.estado)} — CEP ${escapeAddr(a.cep)}`;
  }

  function renderAddressSummary() {
    const addr = addresses.find(a => a.id === selectedAddressId);
    if (!addr) { sumAddrWrap.innerHTML = ''; return; }
    sumAddrWrap.innerHTML = `<div class="sum-addr"><strong>Entregar em:</strong><br>${escapeAddr(addr.nome)} — ${addressLine(addr)}</div>`;
  }

  function selectAddress(id) {
    selectedAddressId = id;
    addressCardBody.querySelectorAll('.addr-option').forEach((el) => {
      el.classList.toggle('selected', el.dataset.id === id);
      const radio = el.querySelector('input[type=radio]');
      if (radio) radio.checked = el.dataset.id === id;
    });
    const addr = addresses.find(a => a.id === id);
    if (addr && cepInput) {
      cepInput.value = addr.cep.replace(/(\d{5})(\d{3})/, '$1-$2');
    }
    renderAddressSummary();
  }

  function renderAddresses() {
    if (!addresses.length) {
      addressCardBody.innerHTML = `
        <div class="addr-empty">
          <p class="text-muted">Você ainda não tem nenhum endereço cadastrado.</p>
          <a class="btn-add-addr" href="minha-conta.html?tab=enderecos">Cadastrar endereço</a>
        </div>`;
      if (continueBtn) continueBtn.disabled = true;
      return;
    }
    addressCardBody.innerHTML = addresses.map((a) => `
      <label class="addr-option" data-id="${a.id}">
        <input type="radio" name="address" value="${a.id}" ${a.principal ? 'checked' : ''}/>
        <div>
          <span class="addr-name">${escapeAddr(a.nome)}</span>${a.principal ? '<span class="addr-badge">PRINCIPAL</span>' : ''}
          <div class="addr-line">${addressLine(a)}</div>
        </div>
      </label>
    `).join('') + '<a class="btn-add-addr" href="minha-conta.html?tab=enderecos" style="background:transparent;color:#2563EB;padding:8px 0;">+ Adicionar outro endereço</a>';

    addressCardBody.querySelectorAll('.addr-option').forEach((el) => {
      el.addEventListener('click', () => selectAddress(el.dataset.id));
    });

    const principal = addresses.find(a => a.principal) || addresses[0];
    selectAddress(principal.id);
  }

  async function loadAddresses() {
    try {
      const r = await fetch('/api/auth/addresses', {
        headers: { 'x-auth-token': authSession ? authSession.token : '' }
      });
      const data = await r.json();
      addresses = (data && data.addresses) || [];
    } catch (e) {
      addresses = [];
    }
    renderAddresses();
  }

  const cepInput = document.getElementById('cep');
  const calcBtn = document.getElementById('calcBtn');
  const results = document.getElementById('results');
  const cepMsg = document.getElementById('cepMsg');
  const subtotalEl = document.getElementById('subtotal');
  const shippingValueEl = document.getElementById('shippingValue');
  const totalEl = document.getElementById('total');
  const continueBtn = document.getElementById('continueBtn');
  const orderItemsContainer = document.getElementById('order-items');
  const orderEmpty = document.getElementById('order-empty');

  const query = new URLSearchParams(window.location.search);
  const source = query.get('source');
  const storedCart = JSON.parse(localStorage.getItem('iphone-vendas-cart') || '[]');
  const storedBuyNow = JSON.parse(localStorage.getItem('iphone-vendas-buy-now') || 'null');

  const orderItems = source === 'buy'
    ? storedBuyNow ? [storedBuyNow] : []
    : source === 'cart'
    ? storedCart
    : storedCart.length ? storedCart : storedBuyNow ? [storedBuyNow] : [];

  // [LOJA OFICIAL] Subtotal já usa preço com desconto (preco = precoFinal no item normalizado)
  let subtotal = orderItems.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
  subtotalEl.textContent = formatBRL(subtotal);
  orderEmpty.style.display = orderItems.length ? 'none' : 'block';

  // [LOJA OFICIAL] Verifica se é primeira compra para aplicar frete grátis elegível
  // historico-pedidos é gravado em payment.js após pagamento confirmado
  const historicoLocal = localStorage.getItem('historico-pedidos');
  const isPrimeiraCompra = !historicoLocal || JSON.parse(historicoLocal || '[]').length === 0;
  const hasFreteGratis = isPrimeiraCompra && orderItems.some(item => item.freteGratis);

  function renderOrderItems() {
    if (!orderItems.length) {
      orderItemsContainer.innerHTML = '';
      continueBtn.disabled = true;
      return;
    }

    orderItemsContainer.innerHTML = orderItems.map((item) => `
      <div class="order-item">
        <img src="${escapeHtml(item.imagem)}" alt="${escapeHtml(item.nome)}" />
        <div class="order-item-details">
          <strong>${escapeHtml(item.nome)}</strong>
          ${item.descontoHoje ? `<p style="color:#16A34A;font-size:12px;font-weight:700;margin:3px 0;display:inline-flex;align-items:center;gap:3px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> ${item.descontoHoje}% OFF hoje</p>` : ''}
          ${item.brinde ? `<p style="color:#16A34A;font-size:12px;margin:2px 0;display:inline-flex;align-items:center;gap:3px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg> Brinde: ${escapeHtml(String(item.brinde))}</p>` : ''}
          ${item.freteGratis && isPrimeiraCompra ? `<p style="color:#00A650;font-size:12px;margin:2px 0;display:inline-flex;align-items:center;gap:3px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Frete grátis (1ª compra)</p>` : ''}
          <p style="margin:4px 0">Quantidade: ${item.quantidade}</p>
          ${item.precoOriginal
            ? `<p style="margin:2px 0"><s style="color:#94A3B8">${formatBRL(item.precoOriginal)}</s> → <strong style="color:#16A34A">${formatBRL(item.preco)}</strong> cada</p>`
            : `<p style="margin:2px 0">${formatBRL(item.preco)} cada</p>`
          }
          <p style="margin:4px 0"><strong>Subtotal: ${formatBRL(item.preco * item.quantidade)}</strong></p>
        </div>
      </div>
    `).join('');

    continueBtn.disabled = true;
  }

  renderOrderItems();
  loadAddresses();

  const _cepViaCepCache = new Map();

  cepInput.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5,8);
    e.target.value = v;

    const digits = v.replace(/\D/g, '');
    if (digits.length < 8) { cepMsg.textContent = ''; return; }

    // Auto-trigger frete calculation when CEP is complete
    calcBtn.click();

    // Show city/state confirmation from ViaCEP (best-effort, non-blocking)
    if (_cepViaCepCache.has(digits)) {
      const d = _cepViaCepCache.get(digits);
      if (d && !d.erro) cepMsg.textContent = `${d.localidade} / ${d.uf}`;
    } else {
      fetch('https://viacep.com.br/ws/' + digits + '/json/')
        .then(r => r.json())
        .then(d => {
          _cepViaCepCache.set(digits, d);
          if (!d.erro && cepInput.value.replace(/\D/g,'') === digits) {
            cepMsg.textContent = `${d.localidade} / ${d.uf}`;
          }
        })
        .catch(() => {});
    }
  });

  calcBtn.addEventListener('click', () => {
    const cep = cepInput.value.replace(/\D/g, '');
    cepMsg.textContent = '';
    results.innerHTML = '';
    shippingValueEl.textContent = formatBRL(0);
    totalEl.textContent = formatBRL(subtotal);
    continueBtn.disabled = true;

    if (!orderItems.length) {
      cepMsg.textContent = 'Não há itens no pedido. Adicione antes de calcular o frete.';
      return;
    }

    if (!/^[0-9]{8}$/.test(cep)) {
      cepMsg.textContent = 'CEP inválido. Informe 8 dígitos.';
      results.innerHTML = '<p class="muted">Informe um CEP válido para calcular o frete.</p>';
      return;
    }

    const loading = document.createElement('div');
    loading.textContent = 'Calculando frete...';
    loading.className = 'muted';
    results.appendChild(loading);

    setTimeout(() => {
      const shipping = calculateFrete(cep);
      results.innerHTML = '';
      if (!shipping) {
        results.innerHTML = '<p class="muted">Região não atendida para o CEP informado.</p>';
        return;
      }

      // [LOJA OFICIAL] Aplica frete grátis se é 1ª compra e produto elegível
      const shippingFinal = hasFreteGratis ? 0 : shipping.price;

      const card = document.createElement('div');
      card.className = 'shipping-option selected';
      card.innerHTML = `
        <div style="flex:1">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div>
              <div style="font-weight:700">${escapeHtml(shipping.region)}</div>
              <div class="muted">Prazo de entrega: ${escapeHtml(shipping.deadline)}</div>
              ${hasFreteGratis ? `<div style="color:#00A650;font-size:12px;font-weight:600;margin-top:3px;display:flex;align-items:center;gap:3px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Frete grátis (1ª compra)</div>` : ''}
            </div>
            <div style="text-align:right">
              ${hasFreteGratis
                ? `<s style="color:#94A3B8;font-size:12px">${formatBRL(shipping.price)}</s><br><strong style="color:#16A34A;font-size:15px">GRÁTIS</strong>`
                : `<div class="price">${formatBRL(shipping.price)}</div>`}
            </div>
          </div>
        </div>
      `;
      results.appendChild(card);

      // [LOJA OFICIAL] Exibe frete grátis no resumo do pedido
      if (hasFreteGratis) {
        shippingValueEl.innerHTML = '<span style="color:#16A34A;font-weight:700;display:inline-flex;align-items:center;gap:4px">GRÁTIS (1ª compra) <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>';
      } else {
        shippingValueEl.textContent = formatBRL(shipping.price);
      }
      totalEl.textContent = formatBRL(subtotal + shippingFinal);
      continueBtn.disabled = !selectedAddressId;

      const checkoutSummary = {
        produto: orderItems.map(item => ({
          id: item.id || item.codigo || item.sku || null,
          nome: item.nome,
          preco: item.preco,
          precoOriginal: item.precoOriginal || null,
          descontoHoje: item.descontoHoje || 0,
          quantidade: item.quantidade,
          subtotal: item.preco * item.quantidade,
          freteGratis: item.freteGratis || false,
        })),
        quantidade: orderItems.reduce((sum, item) => sum + item.quantidade, 0),
        subtotal,
        frete: shippingFinal,
        prazo: shipping.deadline,
        total_final: subtotal + shippingFinal,
        hasFreteGratis,
        source,
      };

      localStorage.setItem('shipping', JSON.stringify({
        cep: cepInput.value,
        frete: shippingFinal,
        prazo: shipping.deadline,
        total: subtotal + shippingFinal,
        source,
      }));
      localStorage.setItem('checkout-summary', JSON.stringify(checkoutSummary));
    }, 250);
  });

  continueBtn.addEventListener('click', async () => {
    const stored = localStorage.getItem('shipping');
    if (!stored) {
      alert('Por favor, calcule o frete antes de continuar.');
      return;
    }
    if (!selectedAddressId) {
      alert('Selecione um endereço de entrega antes de continuar.');
      return;
    }

    const summary = JSON.parse(localStorage.getItem('checkout-summary') || 'null');
    const payload = {
      productId: summary && summary.produto.length === 1 ? summary.produto[0].id : summary ? summary.produto.map(p => p.id || p.nome).join(', ') : 'Compra',
      productName: summary ? summary.produto.map(p => p.nome).join(', ') : 'Compra',
      amount: summary ? summary.total_final : subtotal,
      userId: authSession ? authSession.id : null,
      addressId: selectedAddressId,
    };

    try {
      const response = await fetch('/api/payment/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': authSession ? authSession.token : '' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!data.success || !data.paymentId) {
        throw new Error('Não foi possível gerar o pagamento. Tente novamente.');
      }

      window.location.href = 'pagamento.html?id=' + encodeURIComponent(data.paymentId);
    } catch (error) {
      console.error(error);
      alert('Erro ao redirecionar para o pagamento. Tente novamente mais tarde.');
    }
  });

  function calculateFrete(cep) {
    const value = Number(cep);
    if (value >= 1000000 && value <= 5999999) {
      return { region: 'SP Capital', price: 9.9, deadline: '1 a 2 dias' };
    }
    if (value >= 6000000 && value <= 19999999) {
      return { region: 'Interior SP', price: 14.9, deadline: '2 a 4 dias' };
    }
    if (value >= 20000000 && value <= 39999999) {
      return { region: 'Sudeste', price: 18.9, deadline: '3 a 5 dias' };
    }
    if (value >= 40000000 && value <= 65999999) {
      return { region: 'Nordeste', price: 29.9, deadline: '5 a 10 dias' };
    }
    if (value >= 66000000 && value <= 69999999) {
      return { region: 'Norte', price: 39.9, deadline: '7 a 12 dias' };
    }
    if (value >= 70000000 && value <= 79999999) {
      return { region: 'Centro-Oeste', price: 24.9, deadline: '4 a 7 dias' };
    }
    if (value >= 80000000 && value <= 99999999) {
      return { region: 'Sul', price: 21.9, deadline: '3 a 6 dias' };
    }
    return null;
  }

  function formatBRL(v) {
    return v == null ? 'R$ 0,00' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function escapeHtml(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
});
