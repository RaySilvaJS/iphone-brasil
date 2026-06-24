/**
 * WhatsAppValidator — valida campo de telefone e coleta consentimento LGPD.
 * Uso: new WhatsAppValidator(inputElement, { origin: 'cadastro' })
 */
(function (global) {
  'use strict';

  const VALID_DDDS = new Set([
    '11','12','13','14','15','16','17','18','19',
    '21','22','24','27','28',
    '31','32','33','34','35','37','38',
    '41','42','43','44','45','46','47','48','49',
    '51','53','54','55',
    '61','62','63','64','65','66','67','68','69',
    '71','73','74','75','77','79',
    '81','82','83','84','85','86','87','88','89',
    '91','92','93','94','95','96','97','98','99'
  ]);

  function normalize(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
    return d;
  }

  function isValidFormat(d) {
    return d.length >= 10 && d.length <= 11 && VALID_DDDS.has(d.slice(0, 2));
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem('user-session')); } catch { return null; }
  }

  function WhatsAppValidator(input, options) {
    if (!input) return null;
    var origin    = (options && options.origin)    || 'unknown';
    var onConsent = (options && options.onConsent) || null;

    /* ── Status label ── */
    var statusEl = document.createElement('div');
    statusEl.className = 'wa-validator-status';
    statusEl.style.cssText = 'font-size:12px;margin-top:5px;min-height:16px;transition:color .2s;';

    /* ── Consent box ── */
    var consentEl = document.createElement('div');
    consentEl.className = 'wa-validator-consent';
    consentEl.style.cssText = [
      'display:none;margin-top:8px;padding:10px 12px;',
      'background:rgba(37,211,102,.07);border-radius:8px;',
      'border:1px solid rgba(37,211,102,.22);'
    ].join('');
    consentEl.innerHTML = [
      '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;',
      'font-size:13px;line-height:1.5;color:inherit;">',
      '<input type="checkbox" class="wa-cb" style="margin-top:2px;flex-shrink:0;',
      'accent-color:#25D366;width:14px;height:14px;">',
      '<span>Aceito receber atualizações sobre meu pedido, promoções e ofertas da ',
      '<strong>Jessi Iphones</strong> pelo WhatsApp.</span>',
      '</label>'
    ].join('');
    var cb = consentEl.querySelector('.wa-cb');

    /* ── Insert elements after the input (or after .field-error if present) ── */
    var anchor = (input.parentNode && input.parentNode.querySelector('.field-error')) || input;
    anchor.insertAdjacentElement('afterend', consentEl);
    anchor.insertAdjacentElement('afterend', statusEl);

    /* ── Helpers ── */
    var STATUS_COLORS = { ok: '#16A34A', warn: '#B45309', err: '#DC2626', muted: '#64748B', '': 'transparent' };

    function setStatus(type, text) {
      statusEl.style.color = STATUS_COLORS[type] || '#334155';
      statusEl.textContent = text;
    }

    /* ── State ── */
    var timer       = null;
    var lastChecked = '';
    var _hasWA      = null;

    /* ── Validation ── */
    async function check() {
      var d = normalize(input.value);
      if (!d || d.length < 10) {
        setStatus('', '');
        consentEl.style.display = 'none';
        return;
      }
      if (!isValidFormat(d)) {
        setStatus('err', 'Número inválido. Informe DDD + número.');
        consentEl.style.display = 'none';
        return;
      }
      if (d === lastChecked) return;

      setStatus('muted', 'Verificando...');
      consentEl.style.display = 'none';

      try {
        var r = await fetch('/api/whatsapp/validate-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: d })
        });
        var data = await r.json();

        if (!r.ok) {
          setStatus('err', data.error || 'Número inválido.');
          return;
        }

        lastChecked = d;
        _hasWA = data.hasWhatsApp;

        if (data.hasWhatsApp === true) {
          setStatus('ok', '✓ Número válido para WhatsApp');
        } else if (data.hasWhatsApp === false) {
          setStatus('warn', 'WhatsApp não encontrado neste número');
        } else {
          setStatus('ok', '✓ Número informado com sucesso');
        }

        consentEl.style.display = 'block';
      } catch (e) {
        /* Erro de rede — exibe status neutro, não bloqueia o cliente */
        lastChecked = d;
        setStatus('ok', '✓ Número informado com sucesso');
        consentEl.style.display = 'block';
      }
    }

    /* ── Events ── */
    input.addEventListener('input', function () {
      clearTimeout(timer);
      lastChecked = '';
      setStatus('', '');
      timer = setTimeout(check, 1500);
    });

    input.addEventListener('blur', function () {
      clearTimeout(timer);
      check();
    });

    cb.addEventListener('change', async function () {
      var d = normalize(input.value);
      if (!d) return;
      if (onConsent) onConsent(cb.checked, d);
      try {
        var sess = getSession();
        var headers = { 'Content-Type': 'application/json' };
        if (sess && sess.token) headers['X-Auth-Token'] = sess.token;
        await fetch('/api/whatsapp/save-consent', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ phone: d, consent: cb.checked, origin: origin })
        });
      } catch (e) {}
    });

    /* ── Public API ── */
    return {
      getConsent:     function () { return cb.checked; },
      getPhone:       function () { return normalize(input.value); },
      getHasWhatsApp: function () { return _hasWA; },
      reset: function () {
        clearTimeout(timer);
        lastChecked = '';
        _hasWA = null;
        cb.checked = false;
        setStatus('', '');
        consentEl.style.display = 'none';
      }
    };
  }

  global.WhatsAppValidator = WhatsAppValidator;
})(window);
