/* admin-bar.js — Injects the admin toolbar on all public pages when admin is logged in. */
(function () {
  'use strict';

  let session = null;
  try { session = JSON.parse(localStorage.getItem('user-session') || 'null'); } catch {}
  if (!session || !['admin', 'superadmin'].includes(session.role)) return;

  const css = `
    #admin-bar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
      height: 44px; background: #0f172a;
      color: #e2e8f0; display: flex; align-items: center;
      padding: 0 14px; gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px; font-weight: 500;
      box-shadow: 0 2px 12px rgba(0,0,0,.5);
      user-select: none;
    }
    #admin-bar .ab-badge {
      display: inline-flex; align-items: center; gap: 5px;
      background: #1e3a5f; color: #60a5fa;
      border: 1px solid #1d4ed8; border-radius: 5px;
      padding: 3px 9px; font-size: 11px; font-weight: 700;
      letter-spacing: .4px; flex-shrink: 0;
    }
    #admin-bar .ab-user {
      color: #94a3b8; font-size: 11px; flex-shrink: 0; margin-left: 2px;
    }
    #admin-bar .ab-spacer { flex: 1; }
    #admin-bar button, #admin-bar a.ab-btn {
      border: none; cursor: pointer; border-radius: 6px;
      padding: 5px 11px; font-size: 11px; font-weight: 600;
      transition: all .15s; font-family: inherit;
      text-decoration: none; white-space: nowrap;
      display: inline-flex; align-items: center; gap: 4px;
    }
    #admin-bar .ab-edit-btn {
      background: #1e293b; color: #cbd5e1; border: 1px solid #334155;
    }
    #admin-bar .ab-edit-btn:hover { background: #334155; }
    #admin-bar .ab-edit-btn.active {
      background: #1d4ed8; color: #fff; border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59,130,246,.3);
    }
    #admin-bar .ab-new-btn {
      background: #065f46; color: #6ee7b7; border: 1px solid #059669;
    }
    #admin-bar .ab-new-btn:hover { background: #047857; color: #fff; }
    #admin-bar .ab-devops-btn {
      background: transparent; color: #7dd3fc; border: 1px solid #1e3a5f;
    }
    #admin-bar .ab-devops-btn:hover { background: #1e3a5f; }
    #admin-bar .ab-logout-btn {
      background: transparent; color: #f87171; border: 1px solid transparent;
    }
    #admin-bar .ab-logout-btn:hover { background: #7f1d1d; color: #fecaca; border-color: #7f1d1d; }
    /* offset sticky header and fixed elements */
    body.has-admin-bar { padding-top: 44px !important; }
    body.has-admin-bar header { top: 44px !important; }
    body.has-admin-bar .announcement-bar { top: 44px; }
    /* edit mode — activate card overlays */
    body.admin-edit-mode .olx-adcard { position: relative; overflow: visible !important; }
    body.admin-edit-mode .ae-overlay { display: flex !important; }
    body.admin-edit-mode .olx-adcard:hover .ae-overlay {
      background: rgba(59,130,246,.12); border-color: #3b82f6;
    }
    .ae-overlay {
      display: none;
      position: absolute; inset: -2px; z-index: 20;
      border: 2px dashed rgba(59,130,246,.35);
      border-radius: inherit;
      background: rgba(59,130,246,.05);
      pointer-events: none;
      transition: background .15s, border-color .15s;
      flex-wrap: wrap; align-items: flex-start;
      justify-content: flex-end; gap: 4px; padding: 6px;
    }
    .ae-overlay button {
      pointer-events: all; border: none; cursor: pointer;
      border-radius: 5px; padding: 4px 9px;
      font-size: 10px; font-weight: 700;
      display: inline-flex; align-items: center; gap: 3px;
      transition: all .12s; white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .ae-btn-edit { background: #2563eb; color: #fff; }
    .ae-btn-edit:hover { background: #1d4ed8; }
    .ae-btn-dup { background: #fff; color: #374151; border: 1px solid #d1d5db !important; }
    .ae-btn-dup:hover { background: #f3f4f6; }
    .ae-btn-toggle { background: #fff; color: #374151; border: 1px solid #d1d5db !important; }
    .ae-btn-toggle:hover { background: #f3f4f6; }
    .ae-btn-del { background: #fff; color: #dc2626; border: 1px solid #fecaca !important; }
    .ae-btn-del:hover { background: #fef2f2; }
    .ae-archived-ribbon {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,.55); z-index: 15;
      display: flex; align-items: center; justify-content: center;
      color: #fca5a5; font-weight: 800; font-size: 13px; letter-spacing: 1px;
      border-radius: inherit;
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.id = 'admin-bar-styles';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const firstName = session.nome ? session.nome.split(' ')[0] : (session.email || 'Admin');
  const isSuperAdmin = session.role === 'superadmin';

  const bar = document.createElement('div');
  bar.id = 'admin-bar';
  bar.innerHTML = `
    <span class="ab-badge">${isSuperAdmin ? '★' : '⚙'} ${isSuperAdmin ? 'SUPER ADMIN' : 'ADMIN'}</span>
    <span class="ab-user">${firstName}</span>
    <span class="ab-spacer"></span>
    <button class="ab-edit-btn" id="ab-edit-btn" title="Ativar modo de edição inline nos produtos">✏ Modo Edição</button>
    <button class="ab-new-btn" id="ab-new-btn" title="Criar novo produto no catálogo">+ Novo Produto</button>
    <a href="/devops" target="_blank" class="ab-btn ab-devops-btn" title="Painel DevOps">DevOps ↗</a>
    <button class="ab-logout-btn" id="ab-logout-btn">Sair</button>
  `;
  document.body.insertBefore(bar, document.body.firstChild);
  document.body.classList.add('has-admin-bar');

  // Restore edit mode state from sessionStorage
  if (sessionStorage.getItem('admin-edit-mode') === '1') {
    document.body.classList.add('admin-edit-mode');
    document.getElementById('ab-edit-btn').classList.add('active');
    document.getElementById('ab-edit-btn').textContent = '✏ Edição: ON';
    if (window.adminEditAttach) window.adminEditAttach();
  }

  document.getElementById('ab-edit-btn').addEventListener('click', function () {
    const on = document.body.classList.toggle('admin-edit-mode');
    sessionStorage.setItem('admin-edit-mode', on ? '1' : '0');
    this.classList.toggle('active', on);
    this.textContent = on ? '✏ Edição: ON' : '✏ Modo Edição';
    if (on && window.adminEditAttach) window.adminEditAttach();
  });

  document.getElementById('ab-new-btn').addEventListener('click', function () {
    if (window.adminOpenNewProduct) window.adminOpenNewProduct();
  });

  document.getElementById('ab-logout-btn').addEventListener('click', async function () {
    const token = session.token;
    if (token) {
      try { await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Auth-Token': token } }); } catch {}
    }
    localStorage.removeItem('user-session');
    sessionStorage.removeItem('admin-edit-mode');
    location.reload();
  });

  // Expose session for admin-edit.js
  window._adminSession = session;
})();
