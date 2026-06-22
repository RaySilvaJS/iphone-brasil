/* auth.js - Gerenciamento de sessão do usuário */

/**
 * Remove "recondicionado" (e variações) dos textos de produto exibidos ao usuário.
 * Não altera o JSON original — só filtra na camada visual.
 */
window.cleanProductText = function (text) {
  if (!text) return text || '';
  return String(text)
    .replace(/\s*\brecondicionado\b\s*/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

(function () {
  var AUTH_KEY = 'user-session';

  // Lê de localStorage (rememberMe) ou sessionStorage (sessão temporária)
  function _readSession() {
    try {
      var ls = JSON.parse(localStorage.getItem(AUTH_KEY));
      if (ls && ls.token) return { data: ls, storage: 'local' };
    } catch (e) {}
    try {
      var ss = JSON.parse(sessionStorage.getItem(AUTH_KEY));
      if (ss && ss.token) return { data: ss, storage: 'session' };
    } catch (e) {}
    return null;
  }

  window.Auth = {
    getSession: function () {
      var r = _readSession();
      return r ? r.data : null;
    },

    setSession: function (data, rememberMe) {
      var json = JSON.stringify(data);
      if (rememberMe) {
        localStorage.setItem(AUTH_KEY, json);
        try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
      } else {
        sessionStorage.setItem(AUTH_KEY, json);
        try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
      }
    },

    clearSession: function () {
      localStorage.removeItem(AUTH_KEY);
      try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
    },

    isLoggedIn: function () {
      var s = this.getSession();
      return !!(s && s.token);
    },

    getUser: function () {
      return this.getSession();
    },

    logout: function () {
      var r = _readSession();
      if (r && r.data && r.data.token) {
        fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Auth-Token': r.data.token } }).catch(function(){});
      }
      this.clearSession();
      window.location.href = 'login.html';
    },

    requireLogin: function (redirectBack) {
      if (!this.isLoggedIn()) {
        var dest = 'login.html';
        if (redirectBack) {
          dest += '?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        }
        window.location.href = dest;
        return false;
      }
      return true;
    },

    injectAuthNav: function () {
      var existing = document.getElementById('auth-nav-btn');
      if (existing) existing.remove();

      var session = this.getSession();
      var btn = document.createElement('button');
      btn.id = 'auth-nav-btn';
      btn.type = 'button';
      btn.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'gap:6px',
        'padding:8px 14px',
        'border-radius:7px',
        'border:1px solid rgba(255,255,255,0.28)',
        'background:rgba(255,255,255,0.15)',
        'color:#fff',
        'font-family:inherit',
        'font-size:13px',
        'font-weight:600',
        'cursor:pointer',
        'white-space:nowrap',
        'transition:background .2s',
        'flex-shrink:0'
      ].join(';');

      btn.onmouseover = function () { this.style.background = 'rgba(255,255,255,0.28)'; };
      btn.onmouseout = function () { this.style.background = 'rgba(255,255,255,0.15)'; };

      if (session && session.token) {
        var firstName = session.nome ? session.nome.split(' ')[0] : 'Conta';
        btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' + firstName;
        btn.onclick = function () { window.location.href = 'minha-conta.html'; };
      } else {
        btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>Entrar';
        btn.onclick = function () { window.location.href = 'login.html'; };
      }

      // index.html — .header-actions or legacy .top
      var topDiv = document.querySelector('header .header-actions, header .top');
      if (topDiv) {
        // cart-button may be inside a wrapper (.cart-btn-wrap); find a direct child to insert before
        var ref = topDiv.querySelector('.cart-btn-wrap') || null;
        if (!ref) {
          var cb = document.getElementById('cart-button');
          if (cb && cb.parentNode === topDiv) ref = cb;
        }
        if (ref) { topDiv.insertBefore(btn, ref); } else { topDiv.appendChild(btn); }
        return;
      }

      // other pages — .actions, .page-actions, .hdr-actions
      var actionsDiv = document.querySelector('header .actions, header .page-actions, header .hdr-actions');
      if (actionsDiv) {
        actionsDiv.insertBefore(btn, actionsDiv.firstChild);
        return;
      }

      // Fallback: append to header
      var hdr = document.querySelector('header');
      if (hdr) hdr.appendChild(btn);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.Auth.injectAuthNav(); });
  } else {
    window.Auth.injectAuthNav();
  }
})();
