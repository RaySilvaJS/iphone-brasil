(function () {
  var ua = navigator.userAgent || '';
  var isFBIAB = /FBAN|FBAV|FB_IAB|FBIOS|FBSS|Instagram/.test(ua);
  if (!isFBIAB) return;

  window.IS_IAB = true;

  function inject() {
    if (document.getElementById('iab-banner')) return;

    var isAndroid = /Android/.test(ua);
    var url = window.location.href;

    var banner = document.createElement('div');
    banner.id = 'iab-banner';
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
      'background:#1D4ED8', 'color:#fff', 'padding:12px 14px',
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'gap:10px', 'font-family:Inter,sans-serif', 'font-size:13px',
      'box-shadow:0 2px 10px rgba(0,0,0,.3)', 'line-height:1.4'
    ].join(';');

    var msg = document.createElement('span');
    msg.innerHTML = '<strong>Abra no Chrome ou Safari</strong> para finalizar a compra com segurança. O app do Instagram/Facebook pode bloquear o pagamento.';

    var btn = document.createElement('button');
    btn.textContent = isAndroid ? 'Abrir no Chrome' : 'Copiar link';
    btn.style.cssText = [
      'background:#fff', 'color:#1D4ED8', 'border:none', 'border-radius:8px',
      'padding:8px 14px', 'font-size:12px', 'font-weight:700', 'cursor:pointer',
      'white-space:nowrap', 'font-family:inherit', 'flex-shrink:0'
    ].join(';');

    btn.addEventListener('click', function () {
      if (isAndroid) {
        // Android: intent URL para abrir no Chrome externo
        var intentUrl = 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end;';
        window.location.href = intentUrl;
        // Fallback: tenta abrir no browser padrão após 800ms
        setTimeout(function () { window.open(url, '_system'); }, 800);
      } else {
        // iOS: copia o link para área de transferência
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            alert('✅ Link copiado! Cole no Safari ou Chrome para continuar a compra.');
          }).catch(function () {
            prompt('Copie este link e cole no Safari ou Chrome:', url);
          });
        } else {
          prompt('Copie este link e cole no Safari ou Chrome:', url);
        }
      }
    });

    banner.appendChild(msg);
    banner.appendChild(btn);

    var firstChild = document.body.firstChild;
    document.body.insertBefore(banner, firstChild);
    // Empurra o conteúdo para baixo do banner
    document.body.style.marginTop = (parseInt(document.body.style.marginTop || '0') + 66) + 'px';
  }

  if (document.body) {
    inject();
  } else {
    document.addEventListener('DOMContentLoaded', inject);
  }
})();
