const adminList = document.getElementById('admin-product-list');
const feedback = document.getElementById('admin-feedback');
const addButton = document.getElementById('product-add');

const getInput = (id) => document.getElementById(id).value.trim();

let editingId = null;

/**
 * Formata valores para Euro diretamente
 */
const formatCurrencyEUR = (value) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    value,
  );

const loadAdminProducts = async () => {
  const response = await fetch('/api/products');
  const products = await response.json();
  adminList.innerHTML = products
    .map(
      (product) => `
      <article class="product-card">
        <div class="product-card-content">
          <h3>${product.name}</h3>
          <div class="tag-row">
            <span class="tag">${product.model}</span>
            <span class="tag">${product.condition}</span>
            <span class="tag">${product.color}</span>
          </div> 
          <div class="price">${formatCurrencyEUR(product.price)}</div>
          <div class="tag-row">
            <span class="tag">Estoque: ${product.stock}</span>
            <span class="tag">${product.sold ? 'Vendido' : 'Disponível'}</span>
          </div>
          <div class="actions">
            <button class="button button-secondary" onclick="editProduct('${product.id}')">Editar</button>
            <button class="button button-secondary" style="margin-top: 5px;" onclick="markProductSold('${product.id}')">Vendido</button>
            <button class="button button-tertiary" style="background: #ff4a4a; margin-top: 5px;" onclick="deleteProduct('${product.id}')">Remover</button>
          </div>
        </div>
      </article>
    `
    )
    .join('');
};

const editProduct = async (id) => {
  const response = await fetch(`/api/products/${id}`);
  const product = await response.json();
  
  document.getElementById('product-id').value = product.id;
  document.getElementById('product-id').disabled = true; // Bloqueia ID na edição
  document.getElementById('product-name').value = product.name;
  document.getElementById('product-model').value = product.model;
  document.getElementById('product-price').value = product.price;
  document.getElementById('product-condition').value = product.condition;
  document.getElementById('product-color').value = product.color;
  document.getElementById('product-stock').value = product.stock;
  document.getElementById('product-storage').value = product.storage || '';
  document.getElementById('product-description').value = product.description || '';
  document.getElementById('product-image').value = (product.images || []).filter(s => s.startsWith('http')).join('\n');

  if (product.specs) {
    document.getElementById('product-cpu').value = product.specs.Processador || '';
    document.getElementById('product-battery').value = product.specs.Bateria || '';
  }

  editingId = id;
  addButton.textContent = 'Salvar Alterações';
  feedback.textContent = `Editando: ${product.name}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const markProductSold = async (id) => {
  await fetch(`/api/products/${id}/sold`, { method: 'POST' });
  feedback.textContent = 'Produto marcado como vendido.';
  loadAdminProducts();
};

const deleteProduct = async (id) => {
  if (!confirm('Tem certeza que deseja excluir este produto?')) return;
  await fetch(`/api/products/${id}`, { method: 'DELETE' });
  feedback.textContent = 'Produto removido com sucesso.';
  loadAdminProducts();
};

window.markProductSold = markProductSold;
window.deleteProduct = deleteProduct;
window.editProduct = editProduct;

const proofList = document.getElementById('proof-list');

const loadPaymentProofs = async () => {
  if (!proofList) return;
  proofList.innerHTML = '<div class="muted">Carregando comprovantes...</div>';
  try {
    const response = await fetch('/api/payment/all');
    const payments = await response.json();
    proofList.innerHTML = payments
      .filter(payment => payment.proofs && payment.proofs.length > 0)
      .map(payment => `
        <article class="product-card">
          <div class="product-card-content">
            <h3>${payment.productName || payment.productId || 'Pedido'}</h3>
            <div class="tag-row">
              <span class="tag">ID: ${payment.id}</span>
              <span class="tag">Status: ${payment.status}</span>
            </div>
            <div class="price">${formatCurrencyEUR(payment.amount || 0)}</div>
            <p><strong>Cliente:</strong> ${payment.proofs[0].customerName}</p>
            <p><strong>Telefone:</strong> ${payment.proofs[0].customerPhone}</p>
            <div class="actions">
              ${payment.proofs.map(proof => `<a class="button button-secondary" href="/proofs/${proof.storedFileName}" target="_blank" rel="noopener">${proof.fileName}</a>`).join(' ')}
            </div>
          </div>
        </article>
      `)
      .join('');

    if (!proofList.innerHTML.trim()) {
      proofList.innerHTML = '<div class="muted">Nenhum comprovante enviado ainda.</div>';
    }
  } catch (error) {
    proofList.innerHTML = '<div class="muted">Erro ao carregar comprovantes.</div>';
    console.error('Erro ao carregar comprovantes:', error);
  }
};

addButton.addEventListener('click', async () => {
  const id = getInput('product-id');
  const name = getInput('product-name');
  const model = getInput('product-model');
  const priceInput = getInput('product-price');
  const condition = getInput('product-condition');
  const color = getInput('product-color');
  const stock = getInput('product-stock');
  const storage = getInput('product-storage');
  const cpu = getInput('product-cpu');
  const battery = getInput('product-battery');
  const description = getInput('product-description');
  const imageInput = document.getElementById('product-image');
  const imageUrls = (imageInput.value || '').split('\n').map(s => s.trim()).filter(s => s.startsWith('http'));

  if (!id || !name || !model || !priceInput || !color || !stock || (!editingId && imageUrls.length === 0)) {
    feedback.textContent = 'Preencha todos os campos obrigatórios (inclua ao menos uma URL de imagem).';
    return;
  }

  const price = Number(priceInput);
  if (isNaN(price)) {
    feedback.textContent = 'Preço inválido. Por favor, insira um número.';
    return;
  }

  const method = editingId ? 'PUT' : 'POST';
  const url = editingId ? `/api/admin/product/${editingId}` : '/api/admin/product';

  const payload = {
    id,
    name,
    model,
    price,
    condition,
    color,
    stock,
    storage,
    description,
    specs: {
      Processador: cpu || 'A-Series',
      Memória: storage || '128GB',
      Bateria: battery || 'Longa duração'
    }
  };

  if (imageUrls.length > 0) {
    payload.images = imageUrls;
  }

  const response = await fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const errJson = JSON.parse(text);
      feedback.textContent = errJson.error || 'Erro no servidor.';
    } catch (e) {
      feedback.textContent = `Erro ${response.status}: Rota não encontrada ou erro no servidor.`;
    }
    return;
  }

  const result = await response.json();
  if (!result.success) {
    feedback.textContent = result.error || 'Erro ao adicionar produto.';
    return;
  }

  feedback.textContent = editingId ? 'Produto atualizado!' : 'Produto adicionado!';
  
  // Resetar modo de edição
  if (editingId) {
    editingId = null;
    addButton.textContent = 'Adicionar produto';
    document.getElementById('product-id').disabled = false;
  }
  
  loadAdminProducts();
});

// ── PIX CONFIG ────────────────────────────────────────────────────────────────

const loadPixConfig = async () => {
  try {
    const res = await fetch('/api/admin/pix-config', {
      headers: { 'X-Admin-Token': getAdminToken() }
    });
    const cfg = await res.json();
    if (cfg.pixKey)       document.getElementById('pix-key-value').value    = cfg.pixKey;
    if (cfg.pixKeyType)   document.getElementById('pix-key-type').value     = cfg.pixKeyType;
    if (cfg.receiverName) document.getElementById('pix-receiver-name').value = cfg.receiverName;
    if (cfg.receiverCity) document.getElementById('pix-receiver-city').value = cfg.receiverCity;
  } catch {}
};

window.savePixConfig = async () => {
  const pixKey      = document.getElementById('pix-key-value').value.trim();
  const pixKeyType  = document.getElementById('pix-key-type').value;
  const receiverName= document.getElementById('pix-receiver-name').value.trim();
  const receiverCity= document.getElementById('pix-receiver-city').value.trim();
  const fb          = document.getElementById('pix-feedback');

  if (!pixKey) { fb.textContent = 'Informe a chave Pix.'; return; }

  try {
    const res = await fetch('/api/admin/pix-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getAdminToken() },
      body: JSON.stringify({ pixKey, pixKeyType, receiverName, receiverCity })
    });
    const r = await res.json();
    fb.textContent = r.ok ? '✓ Configuração salva com sucesso!' : (r.error || 'Erro ao salvar.');
  } catch (e) {
    fb.textContent = 'Erro ao salvar: ' + e.message;
  }
};

// ── DASHBOARD FINANCEIRO ──────────────────────────────────────────────────────

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const loadFinancialDashboard = async () => {
  const el = document.getElementById('financial-dashboard');
  if (!el) return;
  try {
    const res  = await fetch('/api/admin/financial/dashboard', { headers: { 'X-Admin-Token': getAdminToken() } });
    const data = await res.json();
    const { today, overall } = data;

    const metric = (label, value, sub) => `
      <div class="glass-card" style="padding:16px;text-align:center;">
        <div style="font-size:.75rem;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">${label}</div>
        <div style="font-size:1.6rem;font-weight:800;color:#fff;">${value}</div>
        ${sub ? `<div style="font-size:.75rem;color:#aaa;margin-top:4px;">${sub}</div>` : ''}
      </div>`;

    el.innerHTML = [
      metric('PIX Gerados hoje',           today.pixGenerated,        `Total: ${overall.pixGenerated}`),
      metric('Comprovantes hoje',          today.proofsSent,          `Total: ${overall.proofsSent}`),
      metric('Aprovados hoje',             today.approved,            `Total: ${overall.approved}`),
      metric('Recusados hoje',             today.refused,             `Total: ${overall.refused}`),
      metric('Receita hoje',               fmtBRL(today.revenue),     `Total recebido: ${fmtBRL(overall.totalReceived)}`),
      metric('Pendentes',                  overall.pending,           `Aguardando validação: ${overall.awaitingValidation}`),
      metric('Ticket Médio',               fmtBRL(overall.ticketMedio), ''),
      metric('Total Pendente',             fmtBRL(overall.totalPending), ''),
    ].join('');
  } catch (e) {
    el.innerHTML = `<div class="muted">Erro ao carregar dashboard: ${e.message}</div>`;
  }
};

// ── LISTA DE PEDIDOS / APROVAÇÃO ──────────────────────────────────────────────

let _refusingOrderId = null;

window.loadFinancialOrders = async () => {
  const el     = document.getElementById('financial-orders');
  const filter = document.getElementById('orders-filter')?.value || 'awaiting_validation';
  if (!el) return;
  el.innerHTML = '<div class="muted">Carregando...</div>';

  try {
    const url  = filter === 'awaiting_validation'
      ? '/api/admin/financial/pending-approval'
      : `/api/admin/orders?status=${filter === 'all' ? '' : filter}&limit=50`;
    const res  = await fetch(url, { headers: { 'X-Admin-Token': getAdminToken() } });
    const raw  = await res.json();
    const list = Array.isArray(raw) ? raw : (raw.items || []);

    if (!list.length) { el.innerHTML = '<div class="muted">Nenhum pedido encontrado.</div>'; return; }

    const statusLabel = { pending: '⏳ Aguardando', awaiting_validation: '📄 Comprovante enviado', paid: '✅ Pago', refused: '❌ Recusado' };
    const statusColor = { pending: '#F59E0B', awaiting_validation: '#2563EB', paid: '#16A34A', refused: '#DC2626' };

    el.innerHTML = list.map(o => {
      const short      = o.shortId ? `#${o.shortId}` : o.id.slice(0, 8);
      const createdAt  = o.createdAt ? new Date(o.createdAt).toLocaleString('pt-BR') : '—';
      const proofLink  = o.proofs && o.proofs.length > 0
        ? o.proofs.map(p => `<a href="/proofs/${p.storedFileName}" target="_blank" rel="noopener"
             style="color:#818cf8;font-size:.8rem;text-decoration:underline;">${p.fileName}</a>`).join(' ')
        : '<span style="color:#666;font-size:.8rem;">Sem comprovante</span>';

      const isApprovalPending = o.status === 'awaiting_validation';
      const approveBtn = isApprovalPending
        ? `<button class="button button-primary" style="font-size:.8rem;padding:7px 14px;"
              onclick="approveOrder('${o.id}')">✓ Aprovar</button>`
        : '';
      const refuseBtn = isApprovalPending
        ? `<button class="button" style="font-size:.8rem;padding:7px 14px;background:#DC2626;color:#fff;border-radius:6px;"
              onclick="openRefuseModal('${o.id}')">✕ Recusar</button>`
        : '';
      const resendBtn = isApprovalPending
        ? `<button class="button button-secondary" style="font-size:.8rem;padding:7px 14px;"
              onclick="requestResend('${o.id}')">🔄 Reenviar</button>`
        : '';

      return `
        <div class="glass-card" style="padding:16px;display:grid;gap:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <div>
              <span style="font-size:1rem;font-weight:700;color:#fff;">${short}</span>
              <span style="font-size:.75rem;color:#888;margin-left:8px;">${createdAt}</span>
            </div>
            <span style="font-size:.75rem;font-weight:700;padding:4px 10px;border-radius:20px;background:${statusColor[o.status] || '#444'}22;color:${statusColor[o.status] || '#aaa'};border:1px solid ${statusColor[o.status] || '#444'}55;">
              ${statusLabel[o.status] || o.status}
            </span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.85rem;color:#ccc;">
            <div><strong style="color:#888;">Produto</strong><br>${o.productName || o.productId || '—'}</div>
            <div><strong style="color:#888;">Valor</strong><br>${fmtBRL(o.amount)}</div>
            <div><strong style="color:#888;">Cliente</strong><br>${o.clientName || '—'}</div>
            <div><strong style="color:#888;">Telefone</strong><br>${o.clientPhone || '—'}</div>
          </div>
          <div style="font-size:.85rem;color:#ccc;">
            <strong style="color:#888;">Comprovante:</strong> ${proofLink}
          </div>
          ${o.refuseReason ? `<div style="font-size:.8rem;background:#1f1020;border:1px solid #7f1d1d;border-radius:6px;padding:8px;color:#fca5a5;">Motivo recusa: ${o.refuseReason}</div>` : ''}
          ${isApprovalPending ? `<div style="display:flex;gap:8px;flex-wrap:wrap;">${approveBtn}${refuseBtn}${resendBtn}</div>` : ''}
        </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="muted">Erro: ${e.message}</div>`;
  }
};

window.approveOrder = async (id) => {
  if (!confirm('Confirmar pagamento deste pedido?')) return;
  try {
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getAdminToken() },
      body: JSON.stringify({ status: 'paid' })
    });
    await loadFinancialOrders();
    await loadFinancialDashboard();
  } catch (e) { alert('Erro: ' + e.message); }
};

window.openRefuseModal = (id) => {
  _refusingOrderId = id;
  document.getElementById('refuse-reason-input').value = '';
  const modal = document.getElementById('refuse-modal');
  modal.style.display = 'flex';
};

window.closeRefuseModal = () => {
  _refusingOrderId = null;
  document.getElementById('refuse-modal').style.display = 'none';
};

window.confirmRefuse = async () => {
  if (!_refusingOrderId) return;
  const reason = document.getElementById('refuse-reason-input').value.trim();
  try {
    await fetch(`/api/admin/orders/${_refusingOrderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getAdminToken() },
      body: JSON.stringify({ status: 'refused', refuseReason: reason || 'Motivo não informado' })
    });
    closeRefuseModal();
    await loadFinancialOrders();
    await loadFinancialDashboard();
  } catch (e) { alert('Erro: ' + e.message); }
};

window.requestResend = async (id) => {
  if (!confirm('Solicitar reenvio de comprovante para o cliente?')) return;
  try {
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getAdminToken() },
      body: JSON.stringify({ status: 'pending', adminNote: 'Reenvio de comprovante solicitado' })
    });
    await loadFinancialOrders();
  } catch (e) { alert('Erro: ' + e.message); }
};

// ── Token do admin (URL param ou prompt) ─────────────────────────────────────
function getAdminToken() {
  const urlToken = new URLSearchParams(window.location.search).get('adminToken');
  if (urlToken) return urlToken;
  let t = sessionStorage.getItem('adminToken');
  if (!t) { t = prompt('Informe o ADMIN_TOKEN:') || ''; sessionStorage.setItem('adminToken', t); }
  return t;
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadAdminProducts();
  await loadPaymentProofs();
  await loadPixConfig();
  await loadFinancialDashboard();
  await loadFinancialOrders();
});

