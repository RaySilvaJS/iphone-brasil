// ========== COMPARADOR DE PRODUTOS ==========

let compareList = [];
try { compareList = JSON.parse(localStorage.getItem('compare-list') || '[]'); } catch(e) { compareList = []; }

function toggleCompare(productId) {
  const index = compareList.indexOf(productId);
  if (index > -1) {
    compareList.splice(index, 1);
  } else if (compareList.length < 3) {
    compareList.push(productId);
  } else {
    alert('Máximo de 3 produtos para comparar');
    return;
  }
  localStorage.setItem('compare-list', JSON.stringify(compareList));
  updateCompareBadge();
}

function updateCompareBadge() {
  const badge = document.getElementById('compare-count');
  if (badge) {
    badge.textContent = compareList.length;
    badge.style.display = compareList.length > 0 ? 'flex' : 'none';
  }
}

async function openCompare() {
  if (compareList.length === 0) {
    alert('Selecione produtos para comparar');
    return;
  }

  const modal = document.getElementById('compare-modal');
  if (!modal) return;

  const products = await Promise.all(
    compareList.map(id => fetch(`/api/products/${id}`).then(r => r.json()))
  );

  const specs = products[0].specs ? Object.keys(products[0].specs) : [];
  
  const specsHTML = specs.map(spec => {
    const row = `
      <tr>
        <td><strong>${spec}</strong></td>
        ${products.map(p => `<td>${p.specs[spec] || '—'}</td>`).join('')}
      </tr>
    `;
    return row;
  }).join('');

  const productsHTML = products.map(p => `
    <td class="compare-product">
      <img src="${p.images[0]}" alt="${p.name}" />
      <h4>${p.name}</h4>
      <p class="price">${formatCurrency(p.price)}</p>
      <div class="tags">
        <span class="tag">${p.color}</span>
        <span class="tag">${p.condition}</span>
      </div>
      <p class="rating">⭐ ${p.rating} (${p.reviews} avaliações)</p>
      <button class="button button-primary button-sm" onclick="startChat('${p.name}', 'Gostaria de comprar')">Comprar</button>
      <button class="button button-secondary button-sm" onclick="toggleCompare('${p.id}'); closeCompare()">Remover</button>
    </td>
  `).join('');

  const compareContent = document.getElementById('compare-content');
  if (compareContent) {
    compareContent.innerHTML = `
      <div class="compare-grid">
        <table class="compare-table">
          <thead>
            <tr>
              <td><strong>Especificação</strong></td>
              ${products.map(p => `<td><strong>${p.model}</strong></td>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${specsHTML}
          </tbody>
        </table>
      </div>
      <div class="compare-products">
        ${productsHTML}
      </div>
    `;
  }

  modal.classList.add('open');
}

function closeCompare() {
  const modal = document.getElementById('compare-modal');
  if (modal) {
    modal.classList.remove('open');
  }
}

window.toggleCompare = toggleCompare;
window.openCompare = openCompare;
window.closeCompare = closeCompare;

document.addEventListener('DOMContentLoaded', updateCompareBadge);
