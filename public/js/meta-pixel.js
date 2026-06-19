// ===== META PIXEL — jessi.iphones =====
// Substitua SEU_PIXEL_ID pelo ID do seu Pixel da Meta
// Exemplo: '1234567890123456'

(function () {
  var PIXEL_ID = '1039902935388587';

  !function(f,b,e,v,n,t,s){
    if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)
  }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

  fbq('init', PIXEL_ID);
  fbq('track', 'PageView');

  console.log('[Meta Pixel] PageView —', window.location.pathname);

  // noscript fallback inserido dinamicamente
  (function () {
    var ns = document.createElement('noscript');
    var img = document.createElement('img');
    img.height = '1'; img.width = '1'; img.style.display = 'none';
    img.src = 'https://www.facebook.com/tr?id=' + PIXEL_ID + '&ev=PageView&noscript=1';
    ns.appendChild(img);
    if (document.body) {
      document.body.appendChild(ns);
    } else {
      document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(ns); });
    }
  })();

  // ===== API PÚBLICA =====
  window.MetaPixel = {

    viewContent: function (data) {
      if (typeof fbq !== 'function') return;
      var payload = {
        content_name: data.name,
        content_ids:  [String(data.id)],
        content_type: 'product',
        value:        Number(data.value) || 0,
        currency:     'BRL'
      };
      fbq('track', 'ViewContent', payload);
      console.log('[Meta Pixel] ViewContent:', payload);
    },

    addToCart: function (data) {
      if (typeof fbq !== 'function') return;
      var payload = {
        content_name: data.name,
        content_ids:  [String(data.id)],
        content_type: 'product',
        value:        Number(data.value) || 0,
        currency:     'BRL'
      };
      fbq('track', 'AddToCart', payload);
      console.log('[Meta Pixel] AddToCart:', payload);
    },

    initiateCheckout: function (data) {
      if (typeof fbq !== 'function') return;
      var payload = {
        value:        Number(data.value) || 0,
        currency:     'BRL',
        content_ids:  data.ids || [],
        content_type: 'product',
        num_items:    data.numItems || 1
      };
      fbq('track', 'InitiateCheckout', payload);
      console.log('[Meta Pixel] InitiateCheckout:', payload);
    },

    purchase: function (data) {
      if (typeof fbq !== 'function') return;
      // dispara apenas uma vez por pedido
      var key = 'fbq-purchase-' + data.orderId;
      if (localStorage.getItem(key)) {
        console.log('[Meta Pixel] Purchase já disparado — pedido:', data.orderId);
        return;
      }
      localStorage.setItem(key, '1');
      var payload = {
        value:        Number(data.value) || 0,
        currency:     'BRL',
        content_ids:  data.ids || [],
        content_type: 'product',
        num_items:    data.numItems || 1
      };
      fbq('track', 'Purchase', payload);
      console.log('[Meta Pixel] Purchase:', payload);
    }

  };

})();
