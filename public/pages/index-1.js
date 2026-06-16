class ResultsManager {
  constructor() {
    this.sortDropdown = document.getElementById('sort-dropdown');
    this.sortTrigger  = document.getElementById('sort-trigger');
    this.sortMenu     = document.getElementById('sort-menu');
    this.productCountEl = document.getElementById('product-count');
    this.resultsSection = document.getElementById('results-section');
    this.filtersText    = document.getElementById('filters-text');
    this.sortOptions    = document.querySelectorAll('.sort-dropdown__option');
    this.currentSort    = 'popularity';
    this.initEvents();
  }
  initEvents() {
    this.sortTrigger.addEventListener('click', e => { e.stopPropagation(); this.toggle(); });
    document.addEventListener('click', e => { if (!this.sortDropdown.contains(e.target)) this.close(); });
    this.sortOptions.forEach(opt => opt.addEventListener('click', e => { e.preventDefault(); this.select(opt); }));
    this.observe();
  }
  toggle() { this.sortMenu.classList.contains('active') ? this.close() : this.open(); }
  open()   { this.sortMenu.classList.add('active');    this.sortTrigger.classList.add('active'); }
  close()  { this.sortMenu.classList.remove('active'); this.sortTrigger.classList.remove('active'); }
  select(opt) {
    this.sortOptions.forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    document.getElementById('sort-selected').textContent = opt.textContent.trim();
    this.currentSort = opt.getAttribute('data-sort');
    this.sortProducts();
    setTimeout(() => this.close(), 120);
    this.filtersText.textContent = `Ordenado por ${opt.textContent.trim().toLowerCase()}`;
  }
  sortProducts() {
    const cards = Array.from(document.querySelectorAll('.olx-adcard'));
    const getPrice = c => { const t = c.querySelector('.olx-adcard__price')?.textContent; return t ? parseFloat(t.replace(/[^\d,.]/g,'').replace('.','').replace(',','.')) : 0; };
    const getName  = c => c.querySelector('.olx-adcard__title')?.textContent || '';
    const getRating= c => { const t = c.querySelector('.rating')?.textContent; return t ? parseFloat(t) : 0; };
    cards.sort((a,b) => {
      switch(this.currentSort) {
        case 'price-low':    return getPrice(a) - getPrice(b);
        case 'price-high':   return getPrice(b) - getPrice(a);
        case 'alphabetical': return getName(a).localeCompare(getName(b),'pt-BR');
        case 'newest':       return 0;
        default:             return getRating(b) - getRating(a);
      }
    });
    const grid = document.getElementById('products-grid');
    cards.forEach(c => grid.appendChild(c));
  }
  updateCount() {
    const n = document.querySelectorAll('.olx-adcard:not([style*="display: none"])').length;
    this.productCountEl.textContent = n > 1000 ? '1000+' : n;
    this.filtersText.textContent = `${n} ${n===1?'produto':'produtos'} encontrado(s)`;
    this.resultsSection.style.display = n > 0 ? 'flex' : 'none';
  }
  observe() {
    const grid = document.getElementById('products-grid');
    let _debounce = null;
    new MutationObserver(() => {
      clearTimeout(_debounce);
      _debounce = setTimeout(() => this.updateCount(), 60);
    }).observe(grid, { childList: true });
    this.updateCount();
  }
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', () => window.resultsManager = new ResultsManager())
  : (window.resultsManager = new ResultsManager());

function updateProductsCount() { window.resultsManager?.updateCount(); }
