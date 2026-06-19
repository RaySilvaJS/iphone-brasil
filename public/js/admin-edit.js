/* admin-edit.js — Visual inline product editing for admin users. */
(function () {
  'use strict';

  if (!window._adminSession) return;

  const TOKEN = window._adminSession.token;
  // DevOps master token (set when user logged into /devops)
  const DEVOPS_TOKEN = localStorage.getItem('devops_token') || null;
  const CATALOGS = {
    iphones: 'iPhones', android: 'Android', consoles: 'Consoles',
    smartwatches: 'Smartwatches', acessorios: 'Acessórios', informatica: 'Informática'
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const api = (method, url, body) => {
    const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': TOKEN };
    if (DEVOPS_TOKEN) headers['X-Admin-Token'] = DEVOPS_TOKEN;
    return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());
  };

  const showToast = (msg, err) => {
    const t = document.createElement('div');
    t.style.cssText = `
      position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
      background:${err ? '#991b1b' : '#065f46'};color:#fff;
      padding:11px 20px;border-radius:8px;z-index:200000;
      font-size:13px;font-weight:600;font-family:inherit;
      box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:92vw;text-align:center;
      white-space:pre-wrap;animation:aeToastIn .22s ease;
    `;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  };

  const injectKF = () => {
    if (document.getElementById('ae-kf')) return;
    const s = document.createElement('style');
    s.id = 'ae-kf';
    s.textContent = `
      @keyframes aeToastIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
      @keyframes aeSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
    `;
    document.head.appendChild(s);
  };
  injectKF();

  const f = (extra) => `width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;${extra || ''}`;
  const btn = (bg, color, extra) => `background:${bg};color:${color};border:1px solid transparent;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;display:inline-flex;align-items:center;gap:5px;transition:opacity .15s;${extra || ''}`;
  const lbl = (text) => `<span style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">${text}</span>`;

  // ── Card overlay attachment ───────────────────────────────────────────────────

  const attached = new WeakSet();

  window.adminEditAttach = function () {
    document.querySelectorAll('.olx-adcard[data-product-id]').forEach(card => {
      if (attached.has(card)) return;
      attached.add(card);
      const pid = String(card.getAttribute('data-product-id'));

      const ov = document.createElement('div');
      ov.className = 'ae-overlay';
      ov.innerHTML = `
        <button class="ae-btn-edit" title="Editar">✏ Editar</button>
        <button class="ae-btn-dup"  title="Duplicar">⧉</button>
        <button class="ae-btn-del"  title="Arquivar">🗑</button>
      `;
      card.style.position = 'relative';
      card.appendChild(ov);

      ov.querySelector('.ae-btn-edit').onclick = e => { e.stopPropagation(); openEditDrawer(pid); };
      ov.querySelector('.ae-btn-dup').onclick  = e => { e.stopPropagation(); duplicateProd(pid); };
      ov.querySelector('.ae-btn-del').onclick  = e => { e.stopPropagation(); archiveProd(pid, card); };
    });
  };

  new MutationObserver(() => {
    if (document.body.classList.contains('admin-edit-mode')) window.adminEditAttach();
  }).observe(document.body, { childList: true, subtree: true });

  // ── Quick actions ─────────────────────────────────────────────────────────────

  async function duplicateProd(pid) {
    const info = await api('GET', `/api/catalog/product/${pid}`).catch(() => null);
    if (!info?.catalogKey) return showToast('Produto não encontrado.', true);
    const r = await api('POST', `/api/admin/catalog/${info.catalogKey}/${pid}/duplicate`);
    r.success ? showToast(`Duplicado: "${r.product.name}"`) : showToast(r.error || 'Erro.', true);
  }

  async function archiveProd(pid, card) {
    if (!confirm('Arquivar este produto? Ele ficará oculto mas pode ser restaurado.')) return;
    const info = await api('GET', `/api/catalog/product/${pid}`).catch(() => null);
    if (!info?.catalogKey) return showToast('Produto não encontrado.', true);
    const r = await api('PATCH', `/api/admin/catalog/${info.catalogKey}/${pid}`, { archived: true });
    if (r.success) {
      showToast('Produto arquivado.');
      card.style.opacity = '0.4';
    } else showToast(r.error || 'Erro.', true);
  }

  // ── Edit Drawer ───────────────────────────────────────────────────────────────

  let drawer = null;
  let productData = null;
  let catalogKey = null;

  function createDrawer() {
    const el = document.createElement('div');
    el.id = 'ae-drawer';
    el.style.cssText = `
      position:fixed;top:0;right:0;bottom:0;width:min(500px,100vw);
      background:#fff;z-index:199999;
      box-shadow:-4px 0 32px rgba(0,0,0,.2);
      display:flex;flex-direction:column;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);
    `;

    const catalogOpts = Object.entries(CATALOGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

    el.innerHTML = `
      <!-- Header + Tabs -->
      <div style="background:#0f172a;color:#fff;padding:0;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:10px;padding:14px 18px 0;">
          <span id="ae-d-title" style="font-size:15px;font-weight:700;flex:1;">✏ Editar Produto</span>
          <button id="ae-d-close" style="${btn('rgba(255,255,255,.12)','#fff','padding:4px 10px;font-size:15px;line-height:1;')}">✕</button>
        </div>
        <div style="display:flex;gap:0;padding:10px 18px 0;border-bottom:1px solid rgba(255,255,255,.1);">
          <button data-tab="edit"    class="ae-tab-btn ae-tab-active" style="background:transparent;border:none;color:#fff;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;border-bottom:2px solid #3b82f6;font-family:inherit;">Campos</button>
          <button data-tab="images"  class="ae-tab-btn" style="background:transparent;border:none;color:rgba(255,255,255,.6);padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;border-bottom:2px solid transparent;font-family:inherit;">Imagens</button>
          <button data-tab="history" class="ae-tab-btn" style="background:transparent;border:none;color:rgba(255,255,255,.6);padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;border-bottom:2px solid transparent;font-family:inherit;">Histórico</button>
        </div>
      </div>

      <!-- Loading overlay -->
      <div id="ae-d-loading" style="position:absolute;inset:0;background:rgba(255,255,255,.85);z-index:10;display:none;align-items:center;justify-content:center;font-size:14px;color:#64748b;">Carregando...</div>

      <!-- Body -->
      <div id="ae-d-body" style="flex:1;overflow-y:auto;padding:18px;">

        <!-- FIELDS TAB -->
        <div id="ae-tab-edit">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <label style="grid-column:1/-1;">${lbl('NOME DO PRODUTO')}<input id="ae-f-name" style="${f()}" placeholder="Nome do produto"></label>
            <label>${lbl('PREÇO (R$)')}<input id="ae-f-price" type="number" step="0.01" style="${f()}" placeholder="0.00"></label>
            <label>${lbl('PREÇO ORIGINAL (R$)')}<input id="ae-f-priceOrig" type="number" step="0.01" style="${f()}" placeholder="0.00"></label>
            <label>${lbl('MODELO')}<input id="ae-f-model" style="${f()}" placeholder="iPhone 15 Pro Max"></label>
            <label>${lbl('COR')}<input id="ae-f-color" style="${f()}" placeholder="Preto Titânio"></label>
            <label>${lbl('ARMAZENAMENTO')}<input id="ae-f-storage" style="${f()}" placeholder="256GB"></label>
            <label>${lbl('ESTOQUE')}<input id="ae-f-stock" type="number" style="${f()}" placeholder="1"></label>
            <label>${lbl('CONDIÇÃO')}<select id="ae-f-condition" style="${f()}"><option>Novo</option><option>Seminovo</option><option>Usado</option></select></label>
            <label>${lbl('VENDEDOR')}<input id="ae-f-seller" style="${f()}" placeholder="Apple Store"></label>
            <label>${lbl('AVALIAÇÃO (0–5)')}<input id="ae-f-rating" type="number" step="0.1" min="0" max="5" style="${f()}" placeholder="5.0"></label>
            <label>${lbl('BADGE PROMO')}<input id="ae-f-badge" style="${f()}" placeholder="Oferta do Dia"></label>
            <label>${lbl('% DESCONTO')}<input id="ae-f-discount" type="number" min="0" max="100" style="${f()}" placeholder="0"></label>
            <label style="grid-column:1/-1;">${lbl('URL MERCADO LIVRE')}<input id="ae-f-mlurl" style="${f()}" placeholder="https://..."></label>
            <label style="grid-column:1/-1;">${lbl('DESCRIÇÃO')}<textarea id="ae-f-desc" rows="3" style="${f('resize:vertical;')}"></textarea></label>
          </div>
          <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;"><input type="checkbox" id="ae-f-promo" style="width:15px;height:15px;cursor:pointer;"> Em Promoção</label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;"><input type="checkbox" id="ae-f-archived" style="width:15px;height:15px;cursor:pointer;"> Arquivado</label>
          </div>
        </div>

        <!-- IMAGES TAB -->
        <div id="ae-tab-images" style="display:none;">
          <p style="font-size:12px;color:#64748b;margin:0 0 8px;">Gerencie as imagens. A primeira da lista é a <strong>imagem principal</strong> exibida no catálogo e na página do produto.</p>
          <!-- Preview da imagem principal -->
          <div id="ae-img-preview" style="display:none;margin-bottom:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Pré-visualização — Imagem Principal</div>
            <img id="ae-img-preview-img" src="" alt="" style="max-width:120px;max-height:120px;object-fit:contain;border-radius:6px;border:1px solid #e2e8f0;">
          </div>
          <div id="ae-img-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;"></div>
          <div style="display:flex;gap:8px;margin-bottom:10px;">
            <input id="ae-img-url" style="${f('flex:1;')}" placeholder="Colar URL de imagem...">
            <button id="ae-img-add" style="${btn('#1d4ed8','#fff')}">+ URL</button>
          </div>
          <label id="ae-img-drop" style="display:block;border:2px dashed #cbd5e1;border-radius:8px;padding:14px;text-align:center;cursor:pointer;color:#64748b;font-size:12px;transition:border-color .15s;">
            📁 Clique aqui ou arraste uma imagem<br>
            <small style="color:#94a3b8;">PNG, JPG, WebP • Máx 10MB</small>
            <input type="file" id="ae-img-file" accept="image/*" style="display:none;">
          </label>
          <div id="ae-img-prog" style="font-size:12px;color:#64748b;min-height:18px;margin-top:6px;"></div>
        </div>

        <!-- HISTORY TAB -->
        <div id="ae-tab-history" style="display:none;">
          <p style="font-size:12px;color:#64748b;margin:0 0 12px;">Últimas 50 alterações registradas.</p>
          <div id="ae-hist-list"></div>
        </div>

      </div>

      <!-- Footer -->
      <div style="border-top:1px solid #e2e8f0;padding:12px 18px;display:flex;gap:8px;flex-wrap:wrap;background:#f8fafc;flex-shrink:0;">
        <button id="ae-save" style="${btn('#1d4ed8','#fff','flex:1;justify-content:center;')}">💾 Salvar</button>
        <button id="ae-cancel" style="${btn('#e2e8f0','#374151')}">Cancelar</button>
        <button id="ae-dup" style="${btn('#f0fdf4','#15803d')}" title="Duplicar produto">⧉</button>
        <button id="ae-del" style="${btn('#fef2f2','#dc2626')}" title="Arquivar/restaurar">🗑 Arquivar</button>
      </div>
    `;

    document.body.appendChild(el);

    // Tab switching
    el.querySelectorAll('.ae-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.tab;
        el.querySelectorAll('.ae-tab-btn').forEach(b => {
          b.style.color = b.dataset.tab === name ? '#fff' : 'rgba(255,255,255,.6)';
          b.style.borderBottomColor = b.dataset.tab === name ? '#3b82f6' : 'transparent';
        });
        ['edit','images','history'].forEach(t => {
          document.getElementById(`ae-tab-${t}`).style.display = t === name ? 'block' : 'none';
        });
        if (name === 'images' && productData) renderImages(productData.images || []);
        if (name === 'history' && productData) renderHistory(productData._history || []);
      });
    });

    el.querySelector('#ae-d-close').addEventListener('click', closeDrawer);
    el.querySelector('#ae-cancel').addEventListener('click', closeDrawer);
    el.querySelector('#ae-save').addEventListener('click', saveProduct);
    el.querySelector('#ae-dup').addEventListener('click', async () => {
      if (!productData || !catalogKey) return;
      const r = await api('POST', `/api/admin/catalog/${catalogKey}/${productData.id}/duplicate`);
      r.success ? (showToast(`Duplicado: "${r.product.name}"`), closeDrawer()) : showToast(r.error || 'Erro.', true);
    });
    el.querySelector('#ae-del').addEventListener('click', () => {
      if (!productData) return;
      const willArchive = !document.getElementById('ae-f-archived').checked;
      document.getElementById('ae-f-archived').checked = willArchive;
      el.querySelector('#ae-del').textContent = willArchive ? '↩ Restaurar' : '🗑 Arquivar';
    });

    // Image URL add
    el.querySelector('#ae-img-add').addEventListener('click', () => {
      const url = document.getElementById('ae-img-url').value.trim();
      if (!url || !productData) return;
      productData.images = productData.images || [];
      productData.images.push(url);
      document.getElementById('ae-img-url').value = '';
      renderImages(productData.images);
    });

    // File upload
    const drop = el.querySelector('#ae-img-drop');
    const fileIn = el.querySelector('#ae-img-file');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = '#3b82f6'; });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = '#cbd5e1'; });
    drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = '#cbd5e1'; uploadFile(e.dataTransfer.files[0]); });
    fileIn.addEventListener('change', e => uploadFile(e.target.files[0]));

    window.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer) closeDrawer(); });
    return el;
  }

  function renderImages(images) {
    const list = document.getElementById('ae-img-list');
    if (!list) return;
    list.innerHTML = '';

    // Atualiza pré-visualização da imagem principal
    const preview    = document.getElementById('ae-img-preview');
    const previewImg = document.getElementById('ae-img-preview-img');
    if (images && images.length > 0) {
      if (preview)    preview.style.display = 'block';
      if (previewImg) { previewImg.src = images[0]; previewImg.alt = 'Imagem principal'; }
    } else {
      if (preview) preview.style.display = 'none';
    }

    (images || []).forEach((url, i) => {
      const isMain = i === 0;
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:7px;border-radius:7px;padding:5px 8px;${isMain ? 'background:#eff6ff;border:1.5px solid #3b82f6;' : 'background:#f8fafc;border:1px solid #e2e8f0;'}`;
      row.innerHTML = `
        <div style="position:relative;flex-shrink:0;">
          <img src="${url}" style="width:38px;height:38px;object-fit:cover;border-radius:4px;" onerror="this.src='';this.style.background='#e2e8f0'">
          ${isMain ? `<span style="position:absolute;top:-5px;left:-5px;background:#f59e0b;color:#fff;font-size:9px;font-weight:800;border-radius:3px;padding:1px 3px;line-height:1.2;">⭐ MAIN</span>` : ''}
        </div>
        <span style="flex:1;font-size:10px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${url}">${url.length > 45 ? '…' + url.slice(-38) : url}</span>
        ${!isMain ? `<button data-i="${i}" style="${btn('#dbeafe','#1d4ed8','padding:2px 5px;font-size:10px;')}" class="ai-main" title="Definir como principal">⭐</button>` : ''}
        <button data-i="${i}" style="${btn('#f1f5f9','#374151','padding:3px 6px;font-size:11px;')}${i === 0 ? 'opacity:.35;cursor:default;' : ''}" class="ai-up" title="Para cima"${i === 0 ? ' disabled' : ''}>↑</button>
        <button data-i="${i}" style="${btn('#f1f5f9','#374151','padding:3px 6px;font-size:11px;')}${i >= (images.length - 1) ? 'opacity:.35;cursor:default;' : ''}" class="ai-dn" title="Para baixo"${i >= (images.length - 1) ? ' disabled' : ''}>↓</button>
        <button data-i="${i}" style="${btn('#fef2f2','#dc2626','padding:3px 6px;font-size:11px;')}" class="ai-rm" title="Remover">✕</button>
      `;
      list.appendChild(row);
    });

    list.querySelectorAll('.ai-rm').forEach(b => b.addEventListener('click', () => {
      productData.images.splice(+b.dataset.i, 1);
      renderImages(productData.images);
    }));
    list.querySelectorAll('.ai-up').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i; if (i === 0) return;
      [productData.images[i-1], productData.images[i]] = [productData.images[i], productData.images[i-1]];
      renderImages(productData.images);
    }));
    list.querySelectorAll('.ai-dn').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i; if (i >= productData.images.length - 1) return;
      [productData.images[i], productData.images[i+1]] = [productData.images[i+1], productData.images[i]];
      renderImages(productData.images);
    }));
    list.querySelectorAll('.ai-main').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i; if (i === 0) return;
      const [item] = productData.images.splice(i, 1);
      productData.images.unshift(item);
      renderImages(productData.images);
    }));
  }

  async function uploadFile(file) {
    if (!file || !productData) return;
    if (file.size > 10 * 1024 * 1024) return showToast('Arquivo muito grande (máx 10MB).', true);
    const prog = document.getElementById('ae-img-prog');
    if (prog) prog.textContent = '⏳ Enviando...';
    const reader = new FileReader();
    reader.onload = async e => {
      const r = await api('POST', '/api/admin/upload', { dataUrl: e.target.result, filename: file.name });
      if (r.success) {
        productData.images = productData.images || [];
        productData.images.unshift(r.url); // nova imagem vai para a frente como principal
        renderImages(productData.images);
        if (prog) { prog.textContent = '✓ Imagem adicionada como principal!'; setTimeout(() => { if (prog) prog.textContent = ''; }, 2500); }
      } else {
        if (prog) prog.textContent = '✕ ' + (r.error || 'Erro no upload');
        showToast(r.error || 'Erro ao fazer upload.', true);
      }
    };
    reader.readAsDataURL(file);
  }

  function renderHistory(history) {
    const el = document.getElementById('ae-hist-list');
    if (!el) return;
    if (!history?.length) { el.innerHTML = '<p style="color:#94a3b8;font-size:12px;">Nenhuma alteração registrada.</p>'; return; }
    el.innerHTML = history.map(h => {
      const diffs = Object.entries(h.changes || {}).map(([k, v]) =>
        `<div style="font-size:11px;margin:2px 0;"><b style="color:#374151;">${k}:</b> <span style="color:#ef4444;">${JSON.stringify(v.from)}</span> → <span style="color:#16a34a;">${JSON.stringify(v.to)}</span></div>`
      ).join('') || '<span style="font-size:11px;color:#94a3b8;">Sem detalhes</span>';
      return `<div style="border:1px solid #e2e8f0;border-radius:7px;padding:9px 12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
          <b style="font-size:11px;color:#0f172a;">${h.by || 'Desconhecido'}</b>
          <span style="font-size:10px;color:#94a3b8;">${new Date(h.at).toLocaleString('pt-BR')}</span>
        </div>${diffs}</div>`;
    }).join('');
  }

  function fillForm(p) {
    const v = (id, val) => { const el = document.getElementById(id); if (!el) return; el.type === 'checkbox' ? (el.checked = !!val) : (el.value = val ?? ''); };
    v('ae-f-name', p.name);         v('ae-f-price', p.price);
    v('ae-f-priceOrig', p.priceOriginal ?? p.price);
    v('ae-f-model', p.model);       v('ae-f-color', p.color);
    v('ae-f-storage', p.storage);   v('ae-f-stock', p.stock);
    v('ae-f-condition', p.condition || 'Novo');
    v('ae-f-seller', p.seller);     v('ae-f-rating', p.rating);
    v('ae-f-badge', p.promoBadge);  v('ae-f-discount', p.promoPercent || 0);
    v('ae-f-mlurl', p.mlUrl);       v('ae-f-desc', p.description);
    v('ae-f-promo', p.isPromo);     v('ae-f-archived', p.archived);
    const delBtn = document.getElementById('ae-del');
    if (delBtn) delBtn.textContent = p.archived ? '↩ Restaurar' : '🗑 Arquivar';
  }

  async function openEditDrawer(pid) {
    if (!drawer) drawer = createDrawer();

    // Show loading
    const loading = document.getElementById('ae-d-loading');
    if (loading) loading.style.display = 'flex';
    drawer.style.transform = 'translateX(0)';

    const data = await api('GET', `/api/catalog/product/${pid}`).catch(() => null);
    if (loading) loading.style.display = 'none';

    if (!data?.product) {
      showToast('Produto não encontrado no catálogo.', true);
      drawer.style.transform = 'translateX(100%)';
      return;
    }

    productData = { ...data.product };
    catalogKey = data.catalogKey;

    fillForm(productData);

    // Reset to fields tab
    const fieldsTab = document.getElementById('ae-tab-edit');
    const imagesTab = document.getElementById('ae-tab-images');
    const histTab   = document.getElementById('ae-tab-history');
    if (fieldsTab) fieldsTab.style.display = 'block';
    if (imagesTab) imagesTab.style.display = 'none';
    if (histTab)   histTab.style.display   = 'none';
    drawer.querySelectorAll('.ae-tab-btn').forEach(b => {
      b.style.color = b.dataset.tab === 'edit' ? '#fff' : 'rgba(255,255,255,.6)';
      b.style.borderBottomColor = b.dataset.tab === 'edit' ? '#3b82f6' : 'transparent';
    });
  }

  function closeDrawer() {
    if (drawer) drawer.style.transform = 'translateX(100%)';
    productData = null;
    catalogKey = null;
  }

  async function saveProduct() {
    if (!productData || !catalogKey) return;
    const g = id => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; };
    const payload = {
      name: g('ae-f-name'), price: +g('ae-f-price') || 0,
      priceOriginal: +g('ae-f-priceOrig') || 0,
      model: g('ae-f-model'), color: g('ae-f-color'),
      storage: g('ae-f-storage'), stock: +g('ae-f-stock') || 0,
      condition: g('ae-f-condition'), seller: g('ae-f-seller'),
      rating: +g('ae-f-rating') || 0, promoBadge: g('ae-f-badge'),
      promoPercent: +g('ae-f-discount') || 0,
      mlUrl: g('ae-f-mlurl'), description: g('ae-f-desc'),
      isPromo: g('ae-f-promo'), archived: g('ae-f-archived'),
      images: productData.images || []
    };

    const saveBtn = document.getElementById('ae-save');
    if (saveBtn) { saveBtn.textContent = '⏳ Salvando...'; saveBtn.disabled = true; }

    const r = await api('PATCH', `/api/admin/catalog/${catalogKey}/${productData.id}`, payload);
    if (saveBtn) { saveBtn.textContent = '💾 Salvar'; saveBtn.disabled = false; }

    if (r.success) {
      showToast('Produto salvo com sucesso!');
      productData = r.product;
      // Live-update card in DOM (título, preço e imagem principal)
      const card = document.querySelector(`.olx-adcard[data-product-id="${productData.id}"]`);
      if (card) {
        const title = card.querySelector('.olx-adcard__title');
        if (title) title.textContent = r.product.name;
        const price = card.querySelector('.olx-adcard__price');
        if (price) price.textContent = 'R$ ' + Number(r.product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        // Atualiza imagem principal — aceita http:// e /uploads/
        const newMain = (r.product.images || []).find(s => typeof s === 'string' && s.length > 4 && (s.startsWith('http') || s.startsWith('/uploads/')));
        if (newMain) {
          const imgEl = card.querySelector('.olx-adcard__media img');
          if (imgEl) {
            imgEl.src = newMain;
          } else {
            // Cria o <img> se não existia (produto sem imagem anterior)
            const media = card.querySelector('.olx-adcard__media');
            if (media) {
              const img = document.createElement('img');
              img.src = newMain; img.alt = r.product.name;
              img.loading = 'lazy'; img.decoding = 'async';
              media.appendChild(img);
            }
          }
        }
      }
      // Recarrega catálogo completo para refletir nova ordem das imagens
      if (window.fetchProducts) window.fetchProducts();
      closeDrawer();
    } else {
      showToast(r.error || 'Erro ao salvar.', true);
    }
  }

  // ── New Product Modal ─────────────────────────────────────────────────────────

  let modal = null;

  window.adminOpenNewProduct = function () {
    if (!modal) modal = buildNewModal();
    // Reset form
    modal.querySelectorAll('input,textarea,select').forEach(el => {
      if (el.type === 'checkbox') el.checked = false;
      else if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
      delete el._dirty;
    });
    modal.style.display = 'flex';
  };

  function buildNewModal() {
    const el = document.createElement('div');
    el.id = 'ae-modal';
    el.style.cssText = 'position:fixed;inset:0;z-index:200000;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;padding:16px;';

    const catalogOpts = Object.entries(CATALOGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    el.innerHTML = `
      <div style="background:#fff;border-radius:12px;width:min(560px,100%);max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">
        <div style="background:#0f172a;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <span style="font-size:15px;font-weight:700;">+ Novo Produto</span>
          <button id="ae-m-close" style="${btn('rgba(255,255,255,.12)','#fff','padding:4px 10px;font-size:15px;')}">✕</button>
        </div>
        <div style="padding:18px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <label style="grid-column:1/-1;">${lbl('CATÁLOGO')}<select id="ae-m-catalog" style="${f()}">${catalogOpts}</select></label>
            <label style="grid-column:1/-1;">${lbl('NOME DO PRODUTO *')}<input id="ae-m-name" style="${f()}" placeholder="Nome do produto" required></label>
            <label>${lbl('ID ÚNICO *')}<input id="ae-m-id" style="${f()}" placeholder="ex: iphone-16-pro-preto-256gb"></label>
            <label>${lbl('PREÇO (R$) *')}<input id="ae-m-price" type="number" step="0.01" style="${f()}" placeholder="0.00"></label>
            <label>${lbl('MODELO')}<input id="ae-m-model" style="${f()}" placeholder="iPhone 16 Pro"></label>
            <label>${lbl('COR')}<input id="ae-m-color" style="${f()}" placeholder="Preto Titânio"></label>
            <label>${lbl('ARMAZENAMENTO')}<input id="ae-m-storage" style="${f()}" placeholder="256GB"></label>
            <label>${lbl('ESTOQUE')}<input id="ae-m-stock" type="number" style="${f()}" placeholder="1"></label>
            <label>${lbl('CONDIÇÃO')}<select id="ae-m-condition" style="${f()}"><option>Novo</option><option>Seminovo</option><option>Usado</option></select></label>
            <label style="grid-column:1/-1;">${lbl('URL DA IMAGEM PRINCIPAL')}<input id="ae-m-img" style="${f()}" placeholder="https://..."></label>
            <label style="grid-column:1/-1;">${lbl('DESCRIÇÃO')}<textarea id="ae-m-desc" rows="3" style="${f('resize:vertical;')}" placeholder="Descrição..."></textarea></label>
          </div>
          <div style="display:flex;gap:8px;margin-top:16px;">
            <button id="ae-m-save" style="${btn('#1d4ed8','#fff','flex:1;justify-content:center;')}">💾 Criar Produto</button>
            <button id="ae-m-cancel" style="${btn('#e2e8f0','#374151')}">Cancelar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    el.addEventListener('click', e => { if (e.target === el) el.style.display = 'none'; });
    el.querySelector('#ae-m-close').addEventListener('click', () => { el.style.display = 'none'; });
    el.querySelector('#ae-m-cancel').addEventListener('click', () => { el.style.display = 'none'; });
    el.querySelector('#ae-m-save').addEventListener('click', () => createProduct(el));

    // Auto-generate ID from name
    el.querySelector('#ae-m-name').addEventListener('input', function () {
      const idEl = el.querySelector('#ae-m-id');
      if (!idEl._dirty) {
        idEl.value = this.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').slice(0,55) + '-' + Date.now().toString().slice(-5);
      }
    });
    el.querySelector('#ae-m-id').addEventListener('input', function () { this._dirty = true; });

    return el;
  }

  async function createProduct(el) {
    const g = id => el.querySelector(`#${id}`)?.value?.trim();
    const catalog = g('ae-m-catalog');
    const id = g('ae-m-id');
    const name = g('ae-m-name');
    const price = parseFloat(g('ae-m-price')) || 0;
    if (!name) return showToast('Nome é obrigatório.', true);
    if (!id)   return showToast('ID é obrigatório.', true);

    const saveBtn = el.querySelector('#ae-m-save');
    saveBtn.textContent = '⏳ Criando...'; saveBtn.disabled = true;

    const r = await api('POST', `/api/admin/catalog/${catalog}`, {
      id, name, price, priceOriginal: price,
      model: g('ae-m-model'), color: g('ae-m-color'),
      storage: g('ae-m-storage'), stock: parseInt(g('ae-m-stock')) || 1,
      condition: g('ae-m-condition'), description: g('ae-m-desc'),
      images: g('ae-m-img') ? [g('ae-m-img')] : [],
      isNew: g('ae-m-condition') === 'Novo', rating: 5.0, reviews: 0
    });

    saveBtn.textContent = '💾 Criar Produto'; saveBtn.disabled = false;

    if (r.success) {
      showToast(`✓ "${r.product.name}" criado em ${CATALOGS[catalog]}!`);
      el.style.display = 'none';
    } else {
      showToast(r.error || 'Erro ao criar produto.', true);
    }
  }

  // Auto-attach if edit mode is already active on load
  if (document.body.classList.contains('admin-edit-mode')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.adminEditAttach);
    else window.adminEditAttach();
  }

})();
