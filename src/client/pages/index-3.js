function toggleSupport() {
  const menu = document.getElementById('support-menu');
  const open = document.getElementById('su-icon-open');
  const close = document.getElementById('su-icon-close');
  const visible = menu.style.display !== 'none';
  menu.style.display = visible ? 'none' : 'block';
  open.style.display  = visible ? '' : 'none';
  close.style.display = visible ? 'none' : '';
}
document.addEventListener('click', function(e) {
  if (!e.target.closest('#support-widget')) {
    const menu = document.getElementById('support-menu');
    if (menu && menu.style.display !== 'none') {
      menu.style.display = 'none';
      document.getElementById('su-icon-open').style.display = '';
      document.getElementById('su-icon-close').style.display = 'none';
    }
  }
});
