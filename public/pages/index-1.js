/* index-1.js — Paginação e contagem de produtos */

/* Compatibilidade: funções legadas que podem ser chamadas de outros scripts */
function updateProductsCount() { /* não-op — contagem gerenciada pela paginação */ }

/* Garante que o sort-dropdown (removido do HTML) não cause erros em scripts legados */
window.resultsManager = {
  updateCount: function() {},
  currentSort: 'popularity'
};
