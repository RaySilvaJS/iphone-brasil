'use strict';
const fs   = require('fs');
const path = require('path');

const CATALOG_DIR = path.join(__dirname, '..', 'data', 'catalogs');

const CATALOG_FILES = {
  iphones:      'iphones.json',
  android:      'androids.json',
  consoles:     'consoles.json',
  smartwatches: 'smartwatches.json',
  acessorios:   'acessorios.json',
  informatica:  'informatica.json',
  suplementos:  'suplementos.json',
};

const _cache = {};

function loadCatalog(key) {
  if (_cache[key]) return _cache[key];
  const filename = CATALOG_FILES[key];
  if (!filename) return [];
  try {
    const raw  = fs.readFileSync(path.join(CATALOG_DIR, filename), 'utf-8');
    const data = JSON.parse(raw);
    _cache[key] = Array.isArray(data) ? data : [];
    return _cache[key];
  } catch { return []; }
}

function invalidateCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

function allProducts() {
  return Object.keys(CATALOG_FILES).flatMap(key =>
    loadCatalog(key).map(p => ({ ...p, _catalogKey: key }))
  );
}

function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchProducts(query, { limit = 5, catalogKey = null } = {}) {
  if (!query) return [];
  const q     = norm(query);
  // Inclui números de 1 dígito (ex: "8" em "iphone 8") e palavras com 2+ caracteres
  const words = q.split(' ').filter(w => w.length > 1 || /^\d+$/.test(w));
  if (!words.length) return [];

  let source;
  if (catalogKey && CATALOG_FILES[catalogKey]) {
    source = loadCatalog(catalogKey).map(p => ({ ...p, _catalogKey: catalogKey }));
  } else {
    source = allProducts();
  }

  const scored = source
    .filter(p => p.price > 0 && !p.archived)
    .map(p => {
      const nameN  = norm(p.name  || '');
      const modelN = norm(p.model || '');
      const nameW  = nameN.split(' ');
      const modelW = modelN.split(' ');
      let score = 0;
      for (const w of words) {
        // Palavra exata pontua mais; substring só para termos >= 3 caracteres
        // Isso evita que "8" bata em "128 GB" (bug de busca "iphone 8")
        if (modelW.includes(w))                         score += 4;
        else if (w.length >= 3 && modelN.includes(w))   score += 2;
        if (nameW.includes(w))                           score += 3;
        else if (w.length >= 3 && nameN.includes(w))    score += 1;
      }
      return { product: p, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ product }) => product);
}

function getProductById(id) {
  const sid = String(id);
  for (const key of Object.keys(CATALOG_FILES)) {
    const cat = loadCatalog(key);
    const p   = cat.find(p => String(p.id) === sid);
    if (p) return { ...p, _catalogKey: key };
  }
  return null;
}

function getSiblings(product) {
  if (!product?.model || !product?._catalogKey) return [];
  const cat = loadCatalog(product._catalogKey);
  return cat.filter(
    p => p.model === product.model && String(p.id) !== String(product.id) && p.price > 0 && !p.archived
  ).slice(0, 6);
}

function getRelated(product, { limit = 3 } = {}) {
  if (!product?._catalogKey) return [];
  const cat = loadCatalog(product._catalogKey);
  return cat
    .filter(p => String(p.id) !== String(product.id) && p.price > 0 && !p.archived)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, limit);
}

function getCheaperThan(product, { limit = 3 } = {}) {
  if (!product?._catalogKey) return [];
  const cat = loadCatalog(product._catalogKey);
  return cat
    .filter(p => String(p.id) !== String(product.id) && p.price > 0 && p.price < product.price && !p.archived)
    .sort((a, b) => b.price - a.price)
    .slice(0, limit);
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

module.exports = {
  searchProducts,
  getProductById,
  getSiblings,
  getRelated,
  getCheaperThan,
  formatPrice,
  invalidateCache,
  CATALOG_FILES,
};
