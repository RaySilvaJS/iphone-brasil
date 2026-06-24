// ========== CARRINHO DE COMPRAS ==========

const CART_KEY = 'iphone-vendas-cart';
const BUY_NOW_KEY = 'iphone-vendas-buy-now';

function showCartToast(message, type) {
  var existing = document.getElementById('cart-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'cart-toast';
  var bg = type === 'error' ? '#c53030' : type === 'warning' ? '#c05621' : '#276749';
  toast.style.cssText = [
    'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
    'background:' + bg, 'color:#fff', 'padding:14px 22px', 'border-radius:14px',
    'font-size:14px', 'font-weight:600', 'z-index:99999',
    'box-shadow:0 8px 24px rgba(0,0,0,.18)', 'max-width:calc(100vw - 32px)',
    'text-align:center', 'animation:cartToastIn .25s ease-out'
  ].join(';');
  toast.textContent = message;
  if (!document.getElementById('cart-toast-style')) {
    var s = document.createElement('style');
    s.id = 'cart-toast-style';
    s.textContent = '@keyframes cartToastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
    document.head.appendChild(s);
  }
  document.body.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.remove(); }, 3500);
}

const normalizeCartProduct = (product) => {
  const image = Array.isArray(product.images)
    ? product.images[0]
    : typeof product.image === 'string'
    ? product.image
    : product.imagem || 'https://via.placeholder.com/500x500';

  // [LOJA OFICIAL] Aplica desconto ao preço e preserva campos de extras no item do carrinho
  const precoOriginal = Number(product.price ?? product.preco ?? 0);
  const descontoHoje = product.descontoHoje || 0;
  const precoFinal = descontoHoje > 0 ? precoOriginal * (1 - descontoHoje / 100) : precoOriginal;

  return {
    id: product.id,
    nome: product.name || product.nome || 'Produto',
    preco: precoFinal,
    precoOriginal: descontoHoje > 0 ? precoOriginal : null,
    descontoHoje,
    brinde: product.brinde || null,
    freteGratis: product.freteGratis || false,
    imagem: image,
    quantidade: 1,
  };
};

class Cart {
  constructor() {
    this.items = this.loadCart();
  }

  loadCart() {
    try {
      const stored = localStorage.getItem(CART_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      localStorage.removeItem(CART_KEY);
      return [];
    }
  }

  saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(this.items)); } catch(e) {}
  }

  addItem(product, quantity = 1) {
    const normalized = normalizeCartProduct(product);
    const existing = this.items.find((item) => item.id === normalized.id);
    if (existing) {
      existing.quantidade += quantity;
    } else {
      normalized.quantidade = quantity;
      this.items.push(normalized);
    }
    this.saveCart();
    this.updateUI();
    if (window.MetaPixel) {
      window.MetaPixel.addToCart({ id: normalized.id, name: normalized.nome, value: normalized.preco });
    }
    // Track cart add event for abandoned cart detection
    if (window.JBR_track) {
      const session = JSON.parse(localStorage.getItem('user-session') || 'null');
      window.JBR_track('cart_add', {
        sessionId: window.JBR_sid,
        items: this.items.map(i => ({ id: i.id, nome: i.nome, preco: i.preco, imagem: i.imagem, quantidade: i.quantidade })),
        total: this.getTotal(),
        userEmail: session?.email || null,
        userName:  session?.nome  || null,
        userPhone: session?.whatsapp || null,
      });
    }
    return this.items.length;
  }

  removeItem(productId) {
    this.items = this.items.filter((item) => item.id !== productId);
    this.saveCart();
    this.updateUI();
  }

  updateQuantity(productId, quantity) {
    const item = this.items.find((item) => item.id === productId);
    if (item) {
      item.quantidade = Math.max(1, quantity);
      this.saveCart();
      this.updateUI();
    }
  }

  clear() {
    this.items = [];
    this.saveCart();
    this.updateUI();
  }

  getTotal() {
    return this.items.reduce((sum, item) => sum + item.preco * item.quantidade, 0);
  }

  getCount() {
    return this.items.reduce((sum, item) => sum + item.quantidade, 0);
  }

  updateUI() {
    const badge = document.getElementById('cart-count');
    if (badge) {
      const count = this.getCount();
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }
}

const cart = new Cart();

function openCart() {
  const drawer = document.getElementById('cart-drawer');
  if (drawer) {
    drawer.style.display = 'block';
    drawer.classList.add('open');
    renderCartDrawer();
  }
}

function closeCart() {
  const drawer = document.getElementById('cart-drawer');
  if (drawer) {
    drawer.style.display = 'none';
    drawer.classList.remove('open');
  }
}

function renderCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;

  if (cart.items.length === 0) {
    drawer.querySelector('.drawer-content').innerHTML = `
      <div class="empty-cart">
        <p>Seu carrinho está vazio</p>
        <button class="button button-primary" onclick="closeCart()">Continuar comprando</button>
      </div>
    `;
    return;
  }

  // [LOJA OFICIAL] Exibe preço original riscado + preço com desconto no drawer
  const itemsHTML = cart.items.map(item => {
    const precoUn = item.precoOriginal
      ? `<s style="font-size:11px;color:#94A3B8">${formatCurrency(item.precoOriginal)}</s> <strong style="color:#16A34A">${formatCurrency(item.preco)}</strong>`
      : formatCurrency(item.preco);
    const subtotal = item.preco * item.quantidade;
    return `
    <div class="cart-item">
      <img src="${item.imagem}" alt="${item.nome}" />
      <div class="item-info">
        <h4>${item.nome}</h4>
        ${item.descontoHoje ? `<p style="color:#856404;font-size:10px;font-weight:700;background:#FFF3CD;padding:1px 5px;border-radius:3px;display:inline-flex;align-items:center;gap:3px"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> ${item.descontoHoje}% OFF</p>` : ''}
        ${item.brinde ? `<p style="color:#16A34A;font-size:11px;display:inline-flex;align-items:center;gap:3px"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg> ${item.brinde}</p>` : ''}
        <p>${precoUn}</p>
        <div class="quantity-control">
          <button onclick="cart.updateQuantity('${item.id}', ${item.quantidade - 1})">−</button>
          <span>${item.quantidade}</span>
          <button onclick="cart.updateQuantity('${item.id}', ${item.quantidade + 1})">+</button>
        </div>
      </div>
      <div class="item-price">
        <p>${formatCurrency(subtotal)}</p>
        <button onclick="cart.removeItem('${item.id}')" class="btn-remove" aria-label="Remover"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    </div>
  `;
  }).join('');

  const total = cart.getTotal();

  drawer.querySelector('.drawer-content').innerHTML = `
    <div class="cart-items">
      ${itemsHTML}
    </div>
    <div class="cart-summary">
      <div class="summary-row">
        <span>Subtotal</span>
        <span>${formatCurrency(total)}</span>
      </div>
      <div class="summary-row total">
        <span>Total</span>
        <span>${formatCurrency(total)}</span>
      </div>
    </div>
    <div class="cart-actions">
      <button class="button button-secondary" onclick="closeCart()">Continuar</button>
      <button class="button button-primary" onclick="proceedToCheckout()">Finalizar Compra</button>
      <button class="button button-tertiary" onclick="cart.clear()">Limpar carrinho</button>
    </div>
  `;
}

function proceedToCheckout() {
  if (cart.items.length === 0) {
    showCartToast('Carrinho vazio! Adicione produtos antes de continuar.', 'warning');
    return;
  }
  if (window.Auth && !window.Auth.isLoggedIn()) {
    window.location.href = 'login.html?redirect=' + encodeURIComponent('checkout.html?source=cart');
    return;
  }
  cart.saveCart();
  if (window.MetaPixel) {
    window.MetaPixel.initiateCheckout({
      value:    cart.getTotal(),
      ids:      cart.items.map(function (i) { return String(i.id); }),
      numItems: cart.getCount()
    });
  }
  fetch('/api/events/checkout-visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productName: cart.items.map(function(i){ return i.nome; }).join(', '),
      amount: cart.getTotal()
    })
  }).catch(function(){});
  window.location.href = '/checkout.html?source=cart';
}

window.cart = cart;
window.openCart = openCart;
window.closeCart = closeCart;
window.proceedToCheckout = proceedToCheckout;
window.renderCartDrawer = renderCartDrawer;

document.addEventListener('DOMContentLoaded', () => {
  cart.updateUI();
});

// ========== TYPING MESSAGE (compartilhado) ==========
window._showTypingMessage = function(text, onDone) {
  const existing = document.getElementById('_typing-msg');
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.id = '_typing-msg';
  wrap.innerHTML = `
    <style>
      #_typing-msg {
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        z-index: 99999;
        animation: _tmIn .3s cubic-bezier(.22,1,.36,1);
      }
      @keyframes _tmIn {
        from { opacity:0; transform: translate(-50%,-50%) scale(.9); }
        to   { opacity:1; transform: translate(-50%,-50%) scale(1); }
      }
      #_typing-msg .tm-backdrop {
        position: fixed; inset: 0;
        background: rgba(15,23,42,.35);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: -1;
        animation: _tmFade .3s ease;
      }
      @keyframes _tmFade { from { opacity:0; } to { opacity:1; } }
      #_typing-msg .tm-bubble {
        background: #fff;
        border-radius: 20px;
        padding: 28px 32px 22px;
        box-shadow: 0 24px 64px rgba(0,0,0,.22), 0 4px 16px rgba(0,0,0,.10);
        display: flex; flex-direction: column; align-items: center; gap: 16px;
        border: 1.5px solid #E2E8F0;
        position: relative; overflow: hidden;
        min-width: 300px; max-width: 380px;
        text-align: center;
      }
      #_typing-msg .tm-avatar {
        width: 56px; height: 56px; border-radius: 50%;
        background: linear-gradient(135deg, #2563EB, #1E3A8A);
        display: flex; align-items: center; justify-content: center;
        font-size: 26px; flex-shrink: 0;
        box-shadow: 0 6px 18px rgba(37,99,235,.4);
        animation: _tmPop .4s cubic-bezier(.34,1.56,.64,1);
      }
      @keyframes _tmPop { from { transform:scale(0); } to { transform:scale(1); } }
      #_typing-msg .tm-sender {
        font-size: 11px; font-weight: 700; color: #2563EB;
        font-family: 'Inter', system-ui, sans-serif;
        text-transform: uppercase; letter-spacing: .08em;
        margin-bottom: 2px;
      }
      #_typing-msg .tm-text {
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 15.5px; font-weight: 700; color: #0F172A;
        display: flex; align-items: center; justify-content: center;
        flex-wrap: wrap; gap: 2px; line-height: 1.4;
        min-height: 24px;
      }
      #_typing-msg .tm-cursor {
        display: inline-block; width: 2px; height: 16px;
        background: #2563EB; border-radius: 1px; margin-left: 2px;
        vertical-align: middle;
        animation: _tmBlink .55s step-end infinite;
      }
      @keyframes _tmBlink { 0%,100%{ opacity:1; } 50%{ opacity:0; } }
      #_typing-msg .tm-progress {
        position: absolute; bottom: 0; left: 0; height: 4px;
        background: linear-gradient(90deg, #2563EB 0%, #16A34A 100%);
        width: 0%; transition: width linear;
      }
    </style>
    <div class="tm-backdrop"></div>
    <div class="tm-bubble">
      <div class="tm-avatar">🛒</div>
      <div>
        <div class="tm-sender">jessi.iphones</div>
        <div class="tm-text"><span id="_tm-typed"></span><span class="tm-cursor"></span></div>
      </div>
      <div class="tm-progress" id="_tm-progress"></div>
    </div>
  `;
  document.body.appendChild(wrap);

  const typedEl    = document.getElementById('_tm-typed');
  const progressEl = document.getElementById('_tm-progress');
  const totalMs    = Math.max(1600, text.length * 42);

  requestAnimationFrame(() => {
    progressEl.style.transition = `width ${totalMs}ms linear`;
    progressEl.style.width = '100%';
  });

  let i = 0;
  const charMs = totalMs / text.length;
  const timer = setInterval(() => {
    if (i < text.length) {
      typedEl.textContent += text[i++];
    } else {
      clearInterval(timer);
      const cursor = wrap.querySelector('.tm-cursor');
      if (cursor) cursor.style.display = 'none';
      setTimeout(() => {
        wrap.style.transition = 'opacity .25s, transform .25s';
        wrap.style.opacity = '0';
        wrap.style.transform = 'translate(-50%,-50%) scale(.95)';
        setTimeout(() => { wrap.remove(); if (onDone) onDone(); }, 260);
      }, 350);
    }
  }, charMs);
};
