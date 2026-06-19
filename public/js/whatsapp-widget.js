/* whatsapp-widget.js — Floating WhatsApp help button for all customer pages */
(function () {
  'use strict';

  const WHATSAPP_NUMBER = '5521988631029';
  const WHATSAPP_MSG = encodeURIComponent('Olá! Tenho uma dúvida antes de finalizar minha compra. Pode me ajudar?');
  const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MSG}`;

  const css = `
    #wpp-widget {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9000;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }

    #wpp-card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.08);
      padding: 14px 16px;
      max-width: 236px;
      border: 1px solid #E2E8F0;
      transform: translateY(12px) scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: opacity .22s ease, transform .22s ease;
    }
    #wpp-card.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }
    #wpp-card-title {
      font-size: 13px;
      font-weight: 700;
      color: #0F172A;
      margin-bottom: 4px;
      line-height: 1.3;
    }
    #wpp-card-sub {
      font-size: 11.5px;
      color: #475569;
      line-height: 1.5;
      margin-bottom: 12px;
    }
    #wpp-card-cta {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #25D366;
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
      justify-content: center;
      text-decoration: none;
      transition: background .2s, transform .15s;
    }
    #wpp-card-cta:hover {
      background: #1ebe5c;
      transform: translateY(-1px);
    }

    #wpp-btn {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #25D366;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(37,211,102,.45), 0 2px 8px rgba(0,0,0,.12);
      transition: transform .2s ease, box-shadow .2s ease;
      position: relative;
      flex-shrink: 0;
    }
    #wpp-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 28px rgba(37,211,102,.55), 0 2px 10px rgba(0,0,0,.14);
    }
    #wpp-btn svg {
      width: 30px;
      height: 30px;
      fill: #fff;
      flex-shrink: 0;
    }

    #wpp-pulse {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 14px;
      height: 14px;
      background: #16A34A;
      border-radius: 50%;
      border: 2px solid #fff;
    }
    #wpp-pulse::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      background: rgba(22,163,74,.4);
      animation: wpp-pulse-ring 2s ease-out infinite;
    }
    @keyframes wpp-pulse-ring {
      0%   { transform: scale(0.7); opacity: 1; }
      100% { transform: scale(1.7); opacity: 0; }
    }

    #wpp-status-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    }
    #wpp-status-dot {
      width: 8px;
      height: 8px;
      background: #16A34A;
      border-radius: 50%;
      flex-shrink: 0;
    }
    #wpp-status-text {
      font-size: 11px;
      font-weight: 600;
      color: #16A34A;
    }

    @media (max-width: 480px) {
      #wpp-widget {
        bottom: 16px;
        right: 16px;
      }
      #wpp-card {
        max-width: 210px;
      }
      #wpp-btn {
        width: 50px;
        height: 50px;
      }
      #wpp-btn svg {
        width: 26px;
        height: 26px;
      }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const widget = document.createElement('div');
  widget.id = 'wpp-widget';
  widget.setAttribute('aria-label', 'Fale conosco pelo WhatsApp');
  widget.innerHTML = `
    <div id="wpp-card" role="dialog" aria-label="Suporte via WhatsApp">
      <div id="wpp-status-row">
        <span id="wpp-status-dot"></span>
        <span id="wpp-status-text">Online agora</span>
      </div>
      <div id="wpp-card-title">Alguma duvida? Fale conosco</div>
      <div id="wpp-card-sub">Equipe disponivel para ajudar na sua compra</div>
      <a id="wpp-card-cta" href="${WHATSAPP_URL}" target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp">
        <svg viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg" style="width:16px;height:16px;fill:#fff">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        Iniciar conversa no WhatsApp
      </a>
    </div>

    <button id="wpp-btn" title="Fale conosco pelo WhatsApp" aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      <span id="wpp-pulse"></span>
    </button>
  `;

  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(widget);

    const btn  = document.getElementById('wpp-btn');
    const card = document.getElementById('wpp-card');
    let isOpen = false;

    const open = () => {
      isOpen = true;
      card.classList.add('visible');
      btn.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
      isOpen = false;
      card.classList.remove('visible');
      btn.setAttribute('aria-expanded', 'false');
    };

    btn.addEventListener('click', () => isOpen ? close() : open());

    document.addEventListener('click', (e) => {
      if (!widget.contains(e.target)) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) close();
    });

    setTimeout(open, 3500);
    setTimeout(close, 9000);
  });
})();
