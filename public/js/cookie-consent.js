/* cookie-consent.js - Banner de cookies (LGPD) */
(function () {
  const STORAGE_KEY = 'cookie-consent';

  function getConsent() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function setConsent(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
  }

  function showBanner() {
    if (document.getElementById('cookie-consent-banner')) return;

    const style = document.createElement('style');
    style.textContent = `
      #cookie-consent-banner {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 99999;
        height: auto; min-height: 0;
        background: #111827; color: #F3F4F6;
        padding: 14px 16px;
        display: flex; flex-direction: column; align-items: stretch;
        justify-content: flex-start; align-content: flex-start;
        gap: 10px;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 12.5px;
        box-shadow: 0 -4px 16px rgba(0,0,0,.15);
        box-sizing: border-box;
      }
      #cookie-consent-banner * { box-sizing: border-box; }
      #cookie-consent-banner p { margin: 0; max-width: none; line-height: 1.4; }
      #cookie-consent-banner .cc-actions {
        display: flex; align-items: center; justify-content: center;
        flex-wrap: nowrap; gap: 6px; margin: 0;
      }
      #cookie-consent-banner button, #cookie-consent-banner a.cc-link {
        font-family: inherit; font-size: 11.5px; font-weight: 600;
        cursor: pointer; white-space: nowrap;
        border-radius: 7px; border: 1px solid transparent;
        padding: 8px 10px; line-height: 1.2;
        flex: 1 1 0;
      }
      #cookie-consent-banner .cc-accept { background: #2563EB; color: #fff; }
      #cookie-consent-banner .cc-accept:hover { background: #1D4ED8; }
      #cookie-consent-banner .cc-reject { background: transparent; color: #F3F4F6; border-color: rgba(255,255,255,.35); }
      #cookie-consent-banner .cc-reject:hover { background: rgba(255,255,255,.1); }
      #cookie-consent-banner .cc-link {
        background: transparent; color: #93C5FD; border: none;
        text-decoration: underline; flex: 0 0 auto; padding: 8px 6px;
      }
      @media (min-width: 700px) {
        #cookie-consent-banner {
          flex-direction: row; align-items: center; justify-content: center;
          padding: 14px 24px; gap: 18px; font-size: 13.5px;
        }
        #cookie-consent-banner p { max-width: 560px; line-height: 1.5; flex: 0 1 auto; }
        #cookie-consent-banner .cc-actions { flex-shrink: 0; gap: 8px; }
        #cookie-consent-banner button, #cookie-consent-banner .cc-actions a.cc-link {
          flex: 0 0 auto; font-size: 13px; padding: 9px 16px;
        }
        #cookie-consent-banner .cc-link { padding: 9px 4px; }
      }
    `;
    document.head.appendChild(style);

    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Aviso de cookies');
    banner.innerHTML = `
      <p>Usamos cookies para melhorar sua experiência, lembrar suas preferências e analisar o uso do site. Você pode aceitar ou recusar os cookies não essenciais.</p>
      <div class="cc-actions">
        <a class="cc-link" href="termos.html" target="_blank" rel="noopener">Saiba mais</a>
        <button type="button" class="cc-reject" id="cc-reject-btn">Recusar</button>
        <button type="button" class="cc-accept" id="cc-accept-btn">Aceitar</button>
      </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('cc-accept-btn').addEventListener('click', function () {
      setConsent('accepted');
      banner.remove();
    });
    document.getElementById('cc-reject-btn').addEventListener('click', function () {
      setConsent('rejected');
      banner.remove();
    });
  }

  function init() {
    if (!getConsent()) showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
