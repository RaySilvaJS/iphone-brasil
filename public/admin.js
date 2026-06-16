const adminList = document.getElementById('admin-product-list');
const feedback = document.getElementById('admin-feedback');
const addButton = document.getElementById('product-add');

const scrapeSwappieButton = document.getElementById('scrape-swappie');
const scrapeWortenButton = document.getElementById('scrape-worten');
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

window.addEventListener('DOMContentLoaded', async () => {
  await loadAdminProducts();
  await loadPaymentProofs();
});

scrapeWortenButton.addEventListener('click', async () => {
  feedback.textContent = 'Iniciando importação de produtos da Worten...';
  try {
    const response = await fetch('/api/admin/scrape-worten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (result.success) {
      feedback.textContent = result.message;
      loadAdminProducts(); // Recarrega a lista de produtos no admin
    } else {
      feedback.textContent = result.error || 'Erro desconhecido ao importar da Worten.';
    }
  } catch (error) {
    feedback.textContent = 'Erro de rede ao tentar importar da Worten.';
    console.error('Erro ao importar da Worten:', error);
  }
});

scrapeSwappieButton.addEventListener('click', async () => {
  feedback.textContent = 'Iniciando importação de produtos da Swappie...';
  try {
    const response = await fetch('/api/admin/scrape-swappie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (result.success) {
      feedback.textContent = result.message;
      loadAdminProducts(); // Recarrega a lista de produtos no admin
    } else {
      feedback.textContent = result.error || 'Erro desconhecido ao importar da Swappie.';
    }
  } catch (error) {
    feedback.textContent = 'Erro de rede ao tentar importar da Swappie.';
    console.error('Erro ao importar da Swappie:', error);
  }
});
