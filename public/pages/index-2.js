(function () {
  const menuBtn      = document.getElementById('menu-btn');
  const sideDrawer   = document.getElementById('side-drawer');
  const overlay      = document.getElementById('drawer-overlay');
  const closeBtn     = document.getElementById('drawer-close-btn');

  function openDrawer() {
    sideDrawer.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    menuBtn.setAttribute('aria-expanded', 'true');
  }
  function closeDrawer() {
    sideDrawer.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    menuBtn.setAttribute('aria-expanded', 'false');
  }

  menuBtn.addEventListener('click', openDrawer);
  closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeDrawer(); });

  document.querySelectorAll('.drawer-link[data-catalog]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      closeDrawer();
      const catalog = this.getAttribute('data-catalog');
      document.querySelectorAll('.categories .cat-item').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.catalog === catalog);
      });
      const fm = document.getElementById('filter-model');
      if (fm) fm.value = '';
      if (window.fetchProducts) window.fetchProducts(1);
    });
  });

  try {
    const session = JSON.parse(localStorage.getItem('user-session') || 'null');
    if (session && session.nome) {
      const nameEl = document.getElementById('drawer-user-name');
      const subEl  = document.getElementById('drawer-user-sub');
      const authEl = document.getElementById('drawer-auth-section');
      if (nameEl) nameEl.textContent = 'Olá, ' + session.nome.split(' ')[0];
      if (subEl)  subEl.textContent  = session.email || '';
      if (authEl) authEl.style.display = 'none';
    }
  } catch(e) {}
})();
