require('dotenv').config();
require('./logger'); // Must be first — captures all console output for log viewer

// Captura erros não tratados para evitar que o processo caia silenciosamente
// e derrube o bot do WhatsApp junto com o servidor
process.on('uncaughtException', (err) => {
  console.error('[PROCESSO] Erro não capturado (uncaughtException):', err?.message || err);
  console.error(err?.stack || '');
});
process.on('unhandledRejection', (reason) => {
  console.error('[PROCESSO] Promise rejeitada sem tratamento (unhandledRejection):', reason?.message || reason);
});
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const paymentRouter = require('./payment');
const adminRouter = require('./admin');
const { loadConfig, loadSecurity, saveSecurity } = require('./admin');
const { initWhatsApp, sendPaymentRequest } = require('./whatsapp');
const { v4: uuidv4 } = require('uuid');
const tracker = require('./tracker');
const audit = require('./audit');
const alerts = require('./alerts');

const app = express();
const PORT = process.env.PORT || 4000;
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5521988631029';
const USE_BAILEYS = process.env.USE_BAILEYS === 'true';

const publicPath = path.join(__dirname, '..', 'public'); //
const productsPath = path.join(__dirname, 'data', 'products.json');
const usersPath = path.join(__dirname, 'data', 'users.json');

// Garante que o diretório de dados exista para evitar erros de ENOENT
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(productsPath)) {
  fs.writeFileSync(productsPath, '[]', 'utf-8');
}
if (!fs.existsSync(usersPath)) {
  fs.writeFileSync(usersPath, '[]', 'utf-8');
}

const loadUsers = () => {
  try { return JSON.parse(fs.readFileSync(usersPath, 'utf-8')); } catch (e) { return []; }
};

const saveUsers = (users) => {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf-8');
};

const validateCPF = (cpf) => {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
};

const getAuthUser = (req) => {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (!token) return null;
  const users = loadUsers();
  return users.find(u => u.token === token) || null;
};

const requireAdmin = (req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || '?';
  const method = req.method;
  const url = req.originalUrl;

  // 1) ADMIN_TOKEN master key (X-Admin-Token header or query param)
  const adminToken = req.headers['x-admin-token'] || req.query.adminToken;
  if (adminToken) {
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
    if (ADMIN_TOKEN && adminToken === ADMIN_TOKEN) {
      req.adminUser = { email: 'devops-master', role: 'superadmin' };
      console.log(`[ADMIN-AUTH] OK via ADMIN_TOKEN | ${method} ${url} | ip=${ip}`);
      return next();
    }
    console.warn(`[ADMIN-AUTH] X-Admin-Token inválido | ${method} ${url} | ip=${ip}`);
    return res.status(403).json({ error: 'Token de administrador inválido.', hint: 'Verifique ADMIN_TOKEN no .env' });
  }

  // 2) User auth token (X-Auth-Token) with admin/superadmin role
  const userToken = req.headers['x-auth-token'] || req.query.token;
  if (!userToken) {
    console.warn(`[ADMIN-AUTH] Sem token | ${method} ${url} | ip=${ip}`);
    return res.status(401).json({ error: 'Autenticação necessária.', hint: 'Envie X-Auth-Token ou X-Admin-Token' });
  }

  let users;
  try { users = loadUsers(); } catch (e) {
    console.error(`[ADMIN-AUTH] Falha ao carregar users.json: ${e.message}`);
    return res.status(500).json({ error: 'Erro interno ao verificar autenticação.' });
  }

  const user = users.find(u => u.token === userToken);
  if (!user) {
    console.warn(`[ADMIN-AUTH] Token não encontrado | ${method} ${url} | ip=${ip} | token_prefix=${userToken.slice(0,8)}...`);
    return res.status(403).json({ error: 'Sessão inválida ou expirada.', hint: 'Faça login novamente.' });
  }
  if (!['admin', 'superadmin'].includes(user.role)) {
    console.warn(`[ADMIN-AUTH] Sem permissão | ${method} ${url} | user=${user.email} | role=${user.role || 'user'} | ip=${ip}`);
    return res.status(403).json({ error: 'Acesso negado.', hint: `Sua conta (${user.email}) não tem permissão de admin. Role atual: ${user.role || 'user'}` });
  }

  console.log(`[ADMIN-AUTH] OK | ${method} ${url} | user=${user.email} | role=${user.role} | ip=${ip}`);
  req.adminUser = user;
  next();
};

app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Admin API (before maintenance middleware so panel always works)
app.use('/api/admin', adminRouter);

// Devops panel route
app.get('/devops', (req, res) => res.sendFile(path.join(publicPath, 'devops', 'index.html')));

// Maintenance mode middleware
app.use((req, res, next) => {
  try {
    const cfg = loadConfig();
    if (!cfg.maintenance) return next();
    // Allow admin panel, admin API, and devops
    if (req.path.startsWith('/api/admin') || req.path.startsWith('/devops')) return next();
    // Allow valid admin tokens
    const adminToken = req.headers['x-admin-token'] || req.query.adminToken;
    if (adminToken && adminToken === process.env.ADMIN_TOKEN) return next();
    // Allow admin-role users
    try {
      const users = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
      const ut = req.headers['x-auth-token'] || req.query.token;
      if (ut && users.find(u => u.token === ut && ['admin','superadmin'].includes(u.role))) return next();
    } catch {}
    if (req.accepts('html') && !req.path.startsWith('/api/')) return res.sendFile(path.join(publicPath, 'maintenance.html'));
    return res.status(503).json({ error: 'Site em manutenção. Tente novamente em breve.' });
  } catch { next(); }
});

// IP block middleware
app.use((req, res, next) => {
  try {
    const sec = loadSecurity();
    const ip = req.ip || req.connection.remoteAddress;
    if ((sec.blockedIPs || []).find(b => b.ip === ip)) {
      if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Acesso bloqueado.' });
      return res.status(403).send('Acesso bloqueado.');
    }
  } catch {}
  next();
});

app.use(express.static(publicPath));
app.use('/proofs', express.static(path.join(__dirname, 'data', 'proofs')));
app.use('/api/payment', paymentRouter);

// Rotas Administrativas - Movidas para cima para garantir prioridade
app.post('/api/admin/product', requireAdmin, (req, res) => {
  const products = loadProducts();
  const { id, name, model, price, condition, color, stock, storage, images, specs, description } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: 'ID e nome são obrigatórios' });
  }
  const exists = products.find((item) => item.id === id);
  if (exists) {
    return res.status(400).json({ error: 'Produto já existe com esse ID' });
  }
  const newProduct = {
    id,
    name,
    model,
    price: Number(price),
    condition,
    storage: storage || (specs && specs.Memória) || "128GB",
    color,
    stock: Number(stock) || 1,
    sold: false,
    images: images || [],
    specs: specs || {},
    description: description || '',
    rating: 5.0,
    reviews: 0,
    isNew: condition === 'Novo',
    isPromo: false,
    priceOriginal: Number(price),
    promoPercent: 0
  };
  products.push(newProduct);
  saveProducts(products);
  res.json({ success: true, product: newProduct });
});

app.put('/api/admin/product/:id', requireAdmin, (req, res) => {
  console.log(`Recebendo atualização para o produto: ${req.params.id}`);
  const products = loadProducts();
  const index = products.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Produto não encontrado no banco de dados' });
  }

  const { name, model, price, condition, color, stock, storage, images, specs, description } = req.body;

  const updatedProduct = {
    ...products[index],
    name: name || products[index].name,
    model: model || products[index].model,
    price: price !== undefined ? Number(price) : products[index].price,
    condition: condition || products[index].condition,
    storage: storage || products[index].storage,
    color: color || products[index].color,
    stock: stock !== undefined ? Number(stock) : products[index].stock,
    description: description || products[index].description,
    specs: specs || products[index].specs,
    isNew: (condition || products[index].condition) === 'Novo',
    priceOriginal: price !== undefined ? Number(price) : products[index].priceOriginal
  };

  if (images && images.length > 0) {
    updatedProduct.images = images;
  }

  products[index] = updatedProduct;
  saveProducts(products);
  res.json({ success: true, product: updatedProduct });
});

const loadProducts = () => {
  try {
    const file = fs.readFileSync(productsPath, 'utf-8');
    return JSON.parse(file);
  } catch (error) {
    console.error('Erro ao carregar produtos:', error);
    return [];
  }
};

const saveProducts = (products) => {
  fs.writeFileSync(productsPath, JSON.stringify(products, null, 2), 'utf-8');
};

app.get('/api/products', (req, res) => {
  const products = loadProducts();
  const { category, model, color, minPrice, maxPrice, condition, searchQuery, name } = req.query;
  const searchText = searchQuery || name;
  const filtered = products.filter((product) => {
    const normalizedName = product.name ? product.name.toLowerCase() : '';
    const matchCategory = category
      ? category === 'promo'
        ? product.isPromo === true
        : normalizedName.includes(category.toLowerCase())
      : true;
    const matchModel = model ? (product.model || '').toLowerCase().includes(model.toLowerCase()) : true;
    const matchColor = color ? product.color.toLowerCase() === color.toLowerCase() : true;
    const matchCondition = condition ? product.condition.toLowerCase() === condition.toLowerCase() : true;
    const matchMin = minPrice ? product.price >= Number(minPrice) : true;
    const matchMax = maxPrice ? product.price <= Number(maxPrice) : true;
    const matchSearch = searchText ? normalizedName.includes(searchText.toLowerCase()) : true;
    return matchCategory && matchModel && matchColor && matchCondition && matchMin && matchMax && matchSearch;
  });
  res.json(filtered);
});

app.get('/api/products/:id', (req, res) => {
  const products = loadProducts();
  const product = products.find((item) => item.id === req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }
  res.json(product);
});

// Busca produto em todos os catálogos de /public/data/
const CATALOG_FILES = {
  iphones:      'iphones.json',
  android:      'androids.json',
  consoles:     'consoles.json',
  smartwatches: 'smartwatches.json',
  acessorios:   'acessorios.json',
  informatica:  'informatica.json',
};
// Catálogos ficam em server/data/catalogs/ para sobreviver a deploys (git pull não toca server/data/)
// Na primeira execução, os seeds de public/data/ são copiados para cá automaticamente.
const catalogDataPath = path.join(__dirname, 'data', 'catalogs');
const catalogSeedPath = path.join(__dirname, '..', 'public', 'data');
const _catalogCache = {};

// Bootstrap: copiar seeds se a pasta ainda não existir
if (!fs.existsSync(catalogDataPath)) {
  fs.mkdirSync(catalogDataPath, { recursive: true });
  for (const filename of Object.values(CATALOG_FILES)) {
    const src = path.join(catalogSeedPath, filename);
    const dst = path.join(catalogDataPath, filename);
    if (fs.existsSync(src)) try { fs.copyFileSync(src, dst); } catch {}
  }
}

const loadCatalogFile = (filename) => {
  if (_catalogCache[filename]) return _catalogCache[filename];
  try {
    const data = JSON.parse(fs.readFileSync(path.join(catalogDataPath, filename), 'utf-8'));
    _catalogCache[filename] = data;
    return data;
  } catch { return []; }
};

app.get('/api/catalog/product/:id', (req, res) => {
  const id = String(req.params.id);
  for (const [key, filename] of Object.entries(CATALOG_FILES)) {
    const catalog = loadCatalogFile(filename);
    const product = catalog.find(p => String(p.id) === id);
    if (product) {
      // Irmãos = mesmo modelo (para variações de cor/armazenamento)
      const siblings = product.model
        ? catalog.filter(p => p.model === product.model)
        : [product];
      // Relacionados = 8 outros produtos do mesmo catálogo (sem o atual)
      const related = catalog.filter(p => String(p.id) !== id).slice(0, 8)
        .map(({ id, name, model, price, priceOriginal, rating, images }) =>
          ({ id, name, model, price, priceOriginal, rating, images: (images || []).slice(0, 1) }));
      return res.json({ product, catalogKey: key, siblings, related });
    }
  }
  res.status(404).json({ error: 'Produto não encontrado', id });
});

// ==================== ADMIN CATALOG ENDPOINTS ====================

const CATALOG_EDIT_FIELDS = ['name','model','price','priceOriginal','condition','color','storage','stock','description','images','specs','isPromo','promoPercent','promoBadge','seller','rating','mlUrl','archived','isNew'];

app.patch('/api/admin/catalog/:catalogKey/:productId', requireAdmin, (req, res) => {
  const { catalogKey, productId } = req.params;
  const by = req.adminUser?.email || 'unknown';

  const filename = CATALOG_FILES[catalogKey];
  if (!filename) {
    console.warn(`[CATALOG-EDIT] Catálogo inválido: "${catalogKey}" | by=${by}`);
    return res.status(400).json({ error: `Catálogo inválido: "${catalogKey}". Válidos: ${Object.keys(CATALOG_FILES).join(', ')}` });
  }

  const filePath = path.join(catalogDataPath, filename);
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`[CATALOG-EDIT] Falha ao ler ${filename}: ${e.message}`);
    return res.status(500).json({ error: `Falha ao ler catálogo: ${e.message}` });
  }

  const idx = catalog.findIndex(p => String(p.id) === String(productId));
  if (idx === -1) {
    console.warn(`[CATALOG-EDIT] Produto não encontrado: id="${productId}" em "${catalogKey}" | by=${by}`);
    return res.status(404).json({ error: `Produto "${productId}" não encontrado no catálogo "${catalogKey}".` });
  }

  const before = { ...catalog[idx] };
  CATALOG_EDIT_FIELDS.forEach(field => {
    if (field in req.body) {
      catalog[idx][field] = ['price','priceOriginal','promoPercent','stock'].includes(field)
        ? Number(req.body[field]) : req.body[field];
    }
  });

  const diff = {};
  CATALOG_EDIT_FIELDS.forEach(k => {
    if (k in req.body && JSON.stringify(before[k]) !== JSON.stringify(catalog[idx][k])) diff[k] = { from: before[k], to: catalog[idx][k] };
  });

  if (!catalog[idx]._history) catalog[idx]._history = [];
  if (Object.keys(diff).length) catalog[idx]._history.unshift({ at: new Date().toISOString(), by, changes: diff });
  catalog[idx]._history = catalog[idx]._history.slice(0, 50);
  delete _catalogCache[filename];

  try {
    fs.writeFileSync(filePath, JSON.stringify(catalog, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[CATALOG-EDIT] Falha ao gravar ${filename}: ${e.message}`);
    return res.status(500).json({ error: `Falha ao salvar produto: ${e.message}` });
  }

  console.log(`[CATALOG-EDIT] OK | id="${productId}" | catálogo="${catalogKey}" | campos=${Object.keys(diff).join(',') || 'nenhum'} | by=${by}`);
  const changedFields = Object.keys(diff);
  audit.append('product_edit', by, req.ip, { productId, catalogKey, fields: changedFields, changes: diff });
  if (diff.price) audit.append('price_change', by, req.ip, { productId, catalogKey, from: diff.price.from, to: diff.price.to });
  res.json({ success: true, product: catalog[idx] });
});

app.post('/api/admin/catalog/:catalogKey', requireAdmin, (req, res) => {
  const { catalogKey } = req.params;
  const filename = CATALOG_FILES[catalogKey];
  if (!filename) return res.status(400).json({ error: 'Catálogo inválido.' });
  const filePath = path.join(catalogDataPath, filename);
  let catalog;
  try { catalog = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return res.status(500).json({ error: 'Erro ao ler catálogo.' }); }
  const { id, name, price } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'ID e nome são obrigatórios.' });
  if (catalog.find(p => String(p.id) === String(id))) return res.status(400).json({ error: 'ID já existe neste catálogo.' });
  const newProd = { id: String(id), images: [] };
  CATALOG_EDIT_FIELDS.forEach(f => { if (req.body[f] !== undefined) newProd[f] = req.body[f]; });
  newProd.name = name;
  newProd.price = Number(price) || 0;
  catalog.unshift(newProd);
  delete _catalogCache[filename];
  try { fs.writeFileSync(filePath, JSON.stringify(catalog, null, 2), 'utf-8'); } catch { return res.status(500).json({ error: 'Erro ao salvar.' }); }
  res.json({ success: true, product: newProd });
});

app.post('/api/admin/catalog/:catalogKey/:productId/duplicate', requireAdmin, (req, res) => {
  const { catalogKey, productId } = req.params;
  const filename = CATALOG_FILES[catalogKey];
  if (!filename) return res.status(400).json({ error: 'Catálogo inválido.' });
  const filePath = path.join(catalogDataPath, filename);
  let catalog;
  try { catalog = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return res.status(500).json({ error: 'Erro ao ler catálogo.' }); }
  const src = catalog.find(p => String(p.id) === String(productId));
  if (!src) return res.status(404).json({ error: 'Produto não encontrado.' });
  const clone = { ...src, id: 'dup_' + Date.now(), name: src.name + ' (Cópia)', _history: [] };
  catalog.unshift(clone);
  delete _catalogCache[filename];
  try { fs.writeFileSync(filePath, JSON.stringify(catalog, null, 2), 'utf-8'); } catch { return res.status(500).json({ error: 'Erro ao salvar.' }); }
  res.json({ success: true, product: clone });
});

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  const { dataUrl, filename } = req.body || {};
  if (!dataUrl) return res.status(400).json({ error: 'dataUrl obrigatório.' });
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: 'Formato inválido.' });
  const safeName = ((filename || 'img') + '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const finalName = Date.now() + '_' + safeName;
  const uploadDir = path.join(publicPath, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  try { fs.writeFileSync(path.join(uploadDir, finalName), Buffer.from(match[2], 'base64')); }
  catch { return res.status(500).json({ error: 'Erro ao salvar arquivo.' }); }
  res.json({ success: true, url: '/uploads/' + finalName });
});

// ==================== TRASH (LIXEIRA) ====================

const TRASH_PATH = path.join(__dirname, 'data', 'trash.json');

const loadTrash = () => {
  try {
    const all = JSON.parse(fs.readFileSync(TRASH_PATH, 'utf-8'));
    const now = Date.now();
    const valid = all.filter(t => new Date(t.expiresAt).getTime() > now);
    // auto-purge expired entries
    if (valid.length !== all.length) fs.writeFileSync(TRASH_PATH, JSON.stringify(valid, null, 2));
    return valid;
  } catch { return []; }
};

const saveTrash = (items) => fs.writeFileSync(TRASH_PATH, JSON.stringify(items, null, 2));

// Soft delete — move product to trash
app.delete('/api/admin/catalog/:catalogKey/:productId', requireAdmin, (req, res) => {
  const { catalogKey, productId } = req.params;
  const by = req.adminUser?.email || 'unknown';
  const reason = (req.body && req.body.reason) || '';

  const filename = CATALOG_FILES[catalogKey];
  if (!filename) return res.status(400).json({ error: 'Catálogo inválido.' });

  const filePath = path.join(catalogDataPath, filename);
  let catalog;
  try { catalog = JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch (e) { return res.status(500).json({ error: 'Erro ao ler catálogo.' }); }

  const idx = catalog.findIndex(p => String(p.id) === String(productId));
  if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado.' });

  const [product] = catalog.splice(idx, 1);
  delete _catalogCache[filename];

  try { fs.writeFileSync(filePath, JSON.stringify(catalog, null, 2), 'utf-8'); }
  catch (e) { return res.status(500).json({ error: 'Erro ao salvar catálogo.' }); }

  const trashItems = loadTrash();
  const entry = {
    trashId: uuidv4(),
    productId: String(productId),
    productName: product.name || String(productId),
    catalogKey,
    productSnapshot: product,
    deletedAt: new Date().toISOString(),
    deletedBy: by,
    deletedByIp: req.ip || '',
    reason,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
  trashItems.unshift(entry);
  saveTrash(trashItems);

  audit.append('product_delete', by, req.ip, { productId, catalogKey, name: product.name, reason });
  console.log(`[CATALOG-DELETE] id="${productId}" catálogo="${catalogKey}" by=${by}`);

  res.json({ success: true, trashId: entry.trashId, productName: entry.productName });
});

// List trash items (metadata only — no full snapshot)
app.get('/api/admin/trash', requireAdmin, (req, res) => {
  const items = loadTrash();
  res.json(items.map(t => ({
    trashId: t.trashId,
    productId: t.productId,
    productName: t.productName,
    catalogKey: t.catalogKey,
    deletedAt: t.deletedAt,
    deletedBy: t.deletedBy,
    reason: t.reason,
    expiresAt: t.expiresAt,
    imageUrl: (t.productSnapshot?.images || []).find(s =>
      typeof s === 'string' && s.length > 4 && (s.startsWith('http') || s.startsWith('/uploads/'))
    ) || null
  })));
});

// Restore product from trash back to catalog
app.post('/api/admin/trash/:trashId/restore', requireAdmin, (req, res) => {
  const { trashId } = req.params;
  const by = req.adminUser?.email || 'unknown';

  const items = loadTrash();
  const idx = items.findIndex(t => t.trashId === trashId);
  if (idx === -1) return res.status(404).json({ error: 'Item não encontrado na lixeira.' });

  const entry = items[idx];
  const filename = CATALOG_FILES[entry.catalogKey];
  if (!filename) return res.status(400).json({ error: `Catálogo "${entry.catalogKey}" não existe mais.` });

  const filePath = path.join(catalogDataPath, filename);
  let catalog;
  try { catalog = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { catalog = []; }

  if (catalog.find(p => String(p.id) === String(entry.productId))) {
    return res.status(409).json({ error: 'Um produto com este ID já existe no catálogo. Exclua-o primeiro.' });
  }

  catalog.unshift(entry.productSnapshot);
  delete _catalogCache[filename];

  try { fs.writeFileSync(filePath, JSON.stringify(catalog, null, 2), 'utf-8'); }
  catch (e) { return res.status(500).json({ error: 'Erro ao salvar catálogo.' }); }

  items.splice(idx, 1);
  saveTrash(items);

  audit.append('product_restore', by, req.ip, { productId: entry.productId, catalogKey: entry.catalogKey, name: entry.productName });

  res.json({ success: true, productId: entry.productId, catalogKey: entry.catalogKey, productName: entry.productName });
});

// Permanently delete from trash (also removes uploaded images)
app.delete('/api/admin/trash/:trashId', requireAdmin, (req, res) => {
  const { trashId } = req.params;
  const by = req.adminUser?.email || 'unknown';

  const items = loadTrash();
  const idx = items.findIndex(t => t.trashId === trashId);
  if (idx === -1) return res.status(404).json({ error: 'Item não encontrado na lixeira.' });

  const entry = items[idx];
  const uploadDir = path.join(publicPath, 'uploads');

  // Remove uploaded images (/uploads/* only — don't touch external http:// URLs)
  (entry.productSnapshot?.images || []).forEach(url => {
    if (typeof url === 'string' && url.startsWith('/uploads/')) {
      try { fs.unlinkSync(path.join(uploadDir, path.basename(url))); } catch {}
    }
  });

  items.splice(idx, 1);
  saveTrash(items);

  audit.append('product_permanent_delete', by, req.ip, { productId: entry.productId, catalogKey: entry.catalogKey, name: entry.productName });
  console.log(`[CATALOG-PERM-DELETE] id="${entry.productId}" catálogo="${entry.catalogKey}" by=${by}`);

  res.json({ success: true });
});

// ==================== CATALOG MANAGER ====================

const CATALOG_BACKUPS_DIR  = path.join(__dirname, 'data', 'backups', 'catalogs');
const CATALOG_HISTORY_FILE = path.join(__dirname, 'data', 'catalog-history.json');
if (!fs.existsSync(CATALOG_BACKUPS_DIR)) fs.mkdirSync(CATALOG_BACKUPS_DIR, { recursive: true });

const CATALOG_LABELS = {
  iphones: 'iPhones', android: 'Androids', consoles: 'Consoles',
  smartwatches: 'Smartwatches', acessorios: 'Acessórios', informatica: 'Informática'
};

function loadCatalogHistory() {
  try { return JSON.parse(fs.readFileSync(CATALOG_HISTORY_FILE, 'utf-8')); } catch { return []; }
}
function saveCatalogHistory(h) {
  try { fs.writeFileSync(CATALOG_HISTORY_FILE, JSON.stringify(h, null, 2)); } catch {}
}

function analyzeCatalog(items) {
  if (!Array.isArray(items)) return null;
  const noImage = items.filter(p => !p.images || (Array.isArray(p.images) && p.images.length === 0)).length;
  const noPrice = items.filter(p => !p.price || p.price === 0).length;
  const promos  = items.filter(p => p.isPromo).length;
  const isNew   = items.filter(p => p.isNew || p.condition === 'Novo').length;
  const byCondition = {};
  items.forEach(p => {
    const c = p.condition || 'Desconhecido';
    byCondition[c] = (byCondition[c] || 0) + 1;
  });
  return { total: items.length, noImage, noPrice, promos, isNew, byCondition };
}

// List all catalogs with stats
app.get('/api/admin/catalogs', requireAdmin, (req, res) => {
  const result = Object.entries(CATALOG_FILES).map(([key, filename]) => {
    const filePath = path.join(catalogDataPath, filename);
    try {
      const stat  = fs.statSync(filePath);
      const items = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const stats = analyzeCatalog(items);
      // Count backups
      const backupDir = path.join(CATALOG_BACKUPS_DIR, key);
      const backupCount = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).length : 0;
      return { key, label: CATALOG_LABELS[key] || key, filename, size: stat.size, modifiedAt: stat.mtime.toISOString(), ...stats, backupCount };
    } catch (e) {
      return { key, label: CATALOG_LABELS[key] || key, filename, size: 0, modifiedAt: null, total: 0, noImage: 0, noPrice: 0, promos: 0, isNew: 0, byCondition: {}, backupCount: 0, error: e.message };
    }
  });
  res.json(result);
});

// Catalog summary for dashboard
app.get('/api/admin/catalogs/summary', requireAdmin, (req, res) => {
  const result = {};
  let grandTotal = 0;
  for (const [key, filename] of Object.entries(CATALOG_FILES)) {
    try {
      const items = JSON.parse(fs.readFileSync(path.join(catalogDataPath, filename), 'utf-8'));
      result[key] = { label: CATALOG_LABELS[key] || key, count: Array.isArray(items) ? items.length : 0 };
      grandTotal += result[key].count;
    } catch { result[key] = { label: CATALOG_LABELS[key] || key, count: 0 }; }
  }
  res.json({ catalogs: result, total: grandTotal });
});

// Import history
app.get('/api/admin/catalogs/history', requireAdmin, (req, res) => {
  res.json(loadCatalogHistory());
});

// List backups for a catalog
app.get('/api/admin/catalogs/:key/backups', requireAdmin, (req, res) => {
  const key = req.params.key;
  if (!CATALOG_FILES[key]) return res.status(400).json({ error: 'Catálogo inválido.' });
  const backupDir = path.join(CATALOG_BACKUPS_DIR, key);
  if (!fs.existsSync(backupDir)) return res.json([]);
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const fp   = path.join(backupDir, f);
        const stat = fs.statSync(fp);
        let count  = 0;
        try { count = JSON.parse(fs.readFileSync(fp, 'utf-8')).length; } catch {}
        return { name: f, size: stat.size, createdAt: stat.mtime.toISOString(), count };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(files);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upload and replace a catalog
app.post('/api/admin/catalogs/:key/upload', requireAdmin, (req, res) => {
  const key    = req.params.key;
  const by     = req.adminUser?.email || req.adminUser?.nome || 'devops';
  const ip     = req.ip || req.connection?.remoteAddress || '?';
  const t0     = Date.now();

  const filename = CATALOG_FILES[key];
  if (!filename) return res.status(400).json({ error: 'Catálogo inválido.' });

  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'Campo "content" obrigatório.' });

  // --- Validate JSON ---
  let newItems;
  try {
    newItems = JSON.parse(content);
  } catch (e) {
    // Try to give a useful error message
    const msg = e.message || 'JSON inválido.';
    const match = msg.match(/position (\d+)/);
    let lineHint = '';
    if (match) {
      const pos  = parseInt(match[1]);
      const lines = content.slice(0, pos).split('\n');
      lineHint = ` (linha ${lines.length}, coluna ${lines[lines.length - 1].length + 1})`;
    }
    return res.status(400).json({ error: `JSON inválido${lineHint}: ${msg}`, validation: false });
  }
  if (!Array.isArray(newItems))  return res.status(400).json({ error: 'O arquivo deve conter um array JSON.', validation: false });
  if (newItems.length === 0)     return res.status(400).json({ error: 'Array vazio. Nenhum produto encontrado.', validation: false });

  const filePath = path.join(catalogDataPath, filename);

  // --- Read current file for diff + backup ---
  let oldItems = [];
  let oldSize  = 0;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    oldSize   = Buffer.byteLength(raw, 'utf-8');
    oldItems  = JSON.parse(raw);
  } catch {}

  // --- Create backup ---
  const stamp     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(CATALOG_BACKUPS_DIR, key);
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupName = `${key}-${stamp}.json`;
  const backupPath = path.join(backupDir, backupName);
  let backupOk = false;
  try {
    if (oldItems.length) {
      fs.copyFileSync(filePath, backupPath);
      backupOk = true;
    }
    // Prune backups older than 30 or more than 50
    const bFiles = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'))
      .map(f => ({ f, mt: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mt - a.mt);
    bFiles.slice(50).forEach(({ f }) => { try { fs.unlinkSync(path.join(backupDir, f)); } catch {} });
  } catch (e) {
    console.warn('[CATALOG] Backup falhou:', e.message);
  }

  // --- Write new file ---
  const newContent = JSON.stringify(newItems, null, 2);
  const newSize    = Buffer.byteLength(newContent, 'utf-8');
  try {
    fs.writeFileSync(filePath, newContent, 'utf-8');
  } catch (e) {
    return res.status(500).json({ error: `Falha ao gravar arquivo: ${e.message}` });
  }

  // --- Clear cache ---
  delete _catalogCache[filename];

  // --- Analyze new catalog ---
  const newStats = analyzeCatalog(newItems);
  const elapsed  = ((Date.now() - t0) / 1000).toFixed(2);
  const diff     = newItems.length - oldItems.length;

  // --- Save history entry ---
  const histEntry = {
    id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    at:        new Date().toISOString(),
    by,
    ip,
    key,
    label:     CATALOG_LABELS[key] || key,
    filename,
    oldCount:  oldItems.length,
    newCount:  newItems.length,
    diff,
    oldSize,
    newSize,
    backupFile: backupOk ? backupName : null,
    elapsed,
    stats: newStats,
    status: 'success',
  };
  const history = loadCatalogHistory();
  history.unshift(histEntry);
  if (history.length > 200) history.length = 200;
  saveCatalogHistory(history);

  audit.append('catalog_upload', by, ip, { key, filename, oldCount: oldItems.length, newCount: newItems.length, diff, backupFile: backupName });
  console.log(`[CATALOG] Upload OK | key=${key} | items: ${oldItems.length}→${newItems.length} | by=${by}`);

  res.json({
    ok: true,
    report: {
      filename,
      label:       CATALOG_LABELS[key] || key,
      oldCount:    oldItems.length,
      newCount:    newItems.length,
      diff,
      oldSize,
      newSize,
      elapsed,
      backupFile:  backupOk ? backupName : null,
      stats:       newStats,
    }
  });
});

// Restore a backup
app.post('/api/admin/catalogs/:key/restore', requireAdmin, (req, res) => {
  const key    = req.params.key;
  const by     = req.adminUser?.email || req.adminUser?.nome || 'devops';
  const ip     = req.ip || req.connection?.remoteAddress || '?';
  const { backupFile } = req.body || {};
  if (!CATALOG_FILES[key]) return res.status(400).json({ error: 'Catálogo inválido.' });
  if (!backupFile)         return res.status(400).json({ error: 'backupFile obrigatório.' });

  const filename   = CATALOG_FILES[key];
  const backupDir  = path.join(CATALOG_BACKUPS_DIR, key);
  const backupPath = path.join(backupDir, backupFile);

  // Path traversal guard
  if (!backupPath.startsWith(backupDir)) return res.status(400).json({ error: 'Arquivo inválido.' });
  if (!fs.existsSync(backupPath))        return res.status(404).json({ error: 'Backup não encontrado.' });

  const filePath = path.join(catalogDataPath, filename);
  let restoredItems = [];
  try {
    const raw    = fs.readFileSync(backupPath, 'utf-8');
    restoredItems = JSON.parse(raw);
    // Backup current before restoring
    const stamp   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const preBk   = path.join(backupDir, `${key}-pre-restore-${stamp}.json`);
    try { fs.copyFileSync(filePath, preBk); } catch {}
    fs.writeFileSync(filePath, raw, 'utf-8');
    delete _catalogCache[filename];
  } catch (e) {
    return res.status(500).json({ error: `Falha ao restaurar: ${e.message}` });
  }

  const histEntry = {
    id: Date.now().toString(36), at: new Date().toISOString(), by, ip, key,
    label: CATALOG_LABELS[key] || key, filename,
    oldCount: null, newCount: restoredItems.length, diff: null,
    backupFile, status: 'restored',
  };
  const history = loadCatalogHistory();
  history.unshift(histEntry);
  if (history.length > 200) history.length = 200;
  saveCatalogHistory(history);
  audit.append('catalog_restore', by, ip, { key, backupFile });
  res.json({ ok: true, newCount: restoredItems.length });
});

// ==================== END ADMIN ====================

app.post('/api/products/:id/sold', (req, res) => {
  const products = loadProducts();
  const product = products.find((item) => item.id === req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }
  product.sold = true;
  saveProducts(products);
  res.json({ success: true, product });
});

app.delete('/api/products/:id', (req, res) => {
  let products = loadProducts();
  const initialLength = products.length;
  products = products.filter((item) => item.id !== req.params.id);
  saveProducts(products);
  res.json({ success: products.length < initialLength });
});

const buildWhatsAppUrl = (text) => {
  const encoded = encodeURIComponent(text);
  return `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encoded}`;
};

const sendWhatsAppMessage = async (text) => {
  if (!USE_BAILEYS) {
    return { url: buildWhatsAppUrl(text), method: 'link' };
  }

  try {
    const { default: makeWASocket, DisconnectReason, useSingleFileAuthState } = require('@whiskeysockets/baileys');
    const { state, saveState } = useSingleFileAuthState(path.join(__dirname, 'auth_info.json'));
    const sock = makeWASocket({ auth: state });
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close' && lastDisconnect?.error) {
        console.error('Baileys desconectado:', lastDisconnect.error);
      }
    });
    await sock.presenceSubscribe(WHATSAPP_NUMBER);
    await sock.sendMessage(WHATSAPP_NUMBER + '@s.whatsapp.net', { text });
    saveState();
    return { url: buildWhatsAppUrl(text), method: 'baileys' };
  } catch (error) {
    console.error('Erro ao usar Baileys, fallback para link:', error.message);
    return { url: buildWhatsAppUrl(text), method: 'link' };
  }
};

app.post('/api/chat', async (req, res) => {
  const { model, interest, name } = req.body;
  const message = `Olá! Tenho interesse em ${model || 'um iPhone'}.${
    interest ? ` Interesse: ${interest}.` : ''
  }${name ? ` Meu nome é ${name}.` : ''} Gostaria de receber atendimento.`;
  const response = await sendWhatsAppMessage(message);
  res.json(response);
});

// Endpoint para cálculo de frete via Melhor Envio
app.post('/api/shipping', async (req, res) => {
  const { cep, subtotal, width = 20, height = 5, length = 15, weight = 0.8 } = req.body || {};
  if (!cep) return res.status(400).json({ error: 'CEP é obrigatório' });

  const MELHOR_ENVIO_TOKEN = process.env.MELHOR_ENVIO_TOKEN;
  if (!MELHOR_ENVIO_TOKEN) {
    return res.status(500).json({ error: 'MELHOR_ENVIO_TOKEN não está configurado no servidor' });
  }

  // Origem (loja) - configure via env ORIGIN_CEP se necessário
  const originCep = process.env.ORIGIN_CEP || '01001-000';

  // Monta payload básico compatível com a API (ajuste conforme documentação da Melhor Envio)
  const payload = {
    from: { postal_code: originCep.replace(/\D/g, '') },
    to: { postal_code: String(cep).replace(/\D/g, '') },
    products: [
      {
        weight: Number(weight),
        width: Number(width),
        height: Number(height),
        length: Number(length),
        insurance_value: subtotal ? Number(subtotal) : 0
      }
    ]
  };

  try {
    // URL base configurável via env (por exemplo https://api.melhorenvio.com.br)
    const base = process.env.MELHOR_ENVIO_API_BASE || 'https://api.melhorenvio.com.br';
    const url = `${base}/api/v2/me/shipment/calculate`;

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${MELHOR_ENVIO_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    // Se a API fornecer um formato diferente, normalize-o aqui. Assumimos um array de opções em response.data
    const data = response.data || {};
    if (!data || (Array.isArray(data) && data.length === 0) || (!Array.isArray(data) && Object.keys(data).length === 0)) {
      return res.status(502).json({ error: 'Resposta inesperada da API do Melhor Envio', raw: data });
    }

    // Normaliza para um formato amigável: [{carrier, service, price, deadline, logo_url}, ...]
    let options = [];
    if (Array.isArray(data)) {
      options = data.map((opt) => ({
        carrier: opt.carrier || opt.name || opt.company || 'Transportadora',
        service: opt.service || opt.modalidade || opt.code || 'Serviço',
        price: opt.price || opt.total || opt.amount || 0,
        deadline: opt.deadline || opt.delivery_time || opt.estimated_delivery || null,
        logo: opt.logo_url || opt.logo || null,
        raw: opt
      }));
    } else if (Array.isArray(data.options)) {
      options = data.options.map((opt) => ({
        carrier: opt.carrier || opt.name || 'Transportadora',
        service: opt.service || opt.modalidade || 'Serviço',
        price: opt.price || opt.total || 0,
        deadline: opt.deadline || opt.delivery_time || null,
        logo: opt.logo || null,
        raw: opt
      }));
    } else if (data.quote) {
      options = data.quote.map((opt) => ({
        carrier: opt.carrier || opt.name || 'Transportadora',
        service: opt.service || opt.modalidade || 'Serviço',
        price: opt.price || opt.total || 0,
        deadline: opt.deadline || opt.delivery_time || null,
        logo: opt.logo || null,
        raw: opt
      }));
    } else {
      // Fallback: transforma objeto em array com uma única opção
      options = [
        {
          carrier: data.carrier || 'Melhor Envio',
          service: data.service || 'Padrão',
          price: data.price || data.total || 0,
          deadline: data.deadline || null,
          logo: data.logo || null,
          raw: data
        }
      ];
    }

    // Responde com opções normalizadas
    res.json({ success: true, options });
  } catch (error) {
    console.error('Erro ao consultar Melhor Envio:', error.message || error);
    // Em caso de erro de rede ou da API, devolve uma resposta amigável e um fallback mínimo
    const fallback = [
      { carrier: 'Correios', service: 'PAC', price: 24.9, deadline: '8 dias úteis', logo: null },
      { carrier: 'Correios', service: 'SEDEX', price: 42.9, deadline: '3 dias úteis', logo: null }
    ];
    res.status(502).json({ error: 'Falha ao consultar Melhor Envio', message: error.message, fallback });
  }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicPath, 'admin.html'));
});

// ===================== AUTH RATE LIMITING =====================

const _authWindows = new Map(); // ip+route → [timestamps]

function authRateLimit(maxAttempts, windowMs) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = ip + req.path;
    const now = Date.now();
    const window = (_authWindows.get(key) || []).filter(t => now - t < windowMs);
    if (window.length >= maxAttempts) {
      const retryAfterSec = Math.ceil((windowMs - (now - window[0])) / 1000);
      res.set('Retry-After', retryAfterSec);
      // Record brute-force alert
      try {
        const sec = loadSecurity();
        if (!sec.loginAttempts) sec.loginAttempts = {};
        sec.loginAttempts[ip] = (sec.loginAttempts[ip] || 0) + 1;
        saveSecurity(sec);
        if (sec.loginAttempts[ip] >= 10) alerts.fire('brute_force', 'Força bruta detectada', `IP ${ip} bloqueado após ${sec.loginAttempts[ip]} tentativas em ${req.path}`, alerts.loadAlerts());
      } catch {}
      return res.status(429).json({ error: `Muitas tentativas. Tente novamente em ${retryAfterSec}s.` });
    }
    window.push(now);
    _authWindows.set(key, window);
    next();
  };
}

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [k, times] of _authWindows) {
    const pruned = times.filter(t => t > cutoff);
    if (pruned.length === 0) _authWindows.delete(k);
    else _authWindows.set(k, pruned);
  }
}, 10 * 60 * 1000);

// ===================== AUTH ROUTES =====================

app.post('/api/auth/register', authRateLimit(5, 15 * 60 * 1000), (req, res) => {
  const { nome, cpf, whatsapp, email, senha } = req.body || {};
  if (!nome || !cpf || !whatsapp || !email || !senha) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  if (!validateCPF(cpf)) {
    return res.status(400).json({ error: 'CPF inválido.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }
  const whatsappDigits = whatsapp.replace(/\D/g, '');
  if (whatsappDigits.length < 10 || whatsappDigits.length > 11) {
    return res.status(400).json({ error: 'WhatsApp inválido. Informe DDD + número.' });
  }
  if (senha.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }
  const users = loadUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase().trim())) {
    return res.status(400).json({ error: 'E-mail já cadastrado.' });
  }
  const newUser = {
    id: uuidv4(),
    nome: nome.trim(),
    cpf: cpf.replace(/\D/g, ''),
    whatsapp: whatsappDigits,
    email: email.toLowerCase().trim(),
    senha: bcrypt.hashSync(senha, 10),
    token: null,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  saveUsers(users);
  tracker.record('signup', { email: newUser.email });
  audit.append('signup', newUser.email, req.ip, { email: newUser.email, nome: newUser.nome });
  res.json({ success: true, message: 'Cadastro realizado com sucesso.' });
});

app.post('/api/auth/login', authRateLimit(10, 15 * 60 * 1000), (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }
  const users = loadUsers();
  const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase().trim());
  if (idx === -1) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  const storedHash = users[idx].senha || '';
  const isBcryptHash = /^\$2[aby]\$/.test(storedHash);
  const passwordOk = isBcryptHash
    ? bcrypt.compareSync(senha, storedHash)
    : storedHash === senha;
  if (!passwordOk) {
    // Track failed login attempt
    try {
      const sec = loadSecurity();
      sec.loginAttempts = [{ ip: req.ip, email, at: new Date().toISOString(), success: false }, ...(sec.loginAttempts || [])].slice(0, 500);
      saveSecurity(sec);
    } catch {}
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  if (!isBcryptHash) {
    // Migra senha legada em texto puro para hash bcrypt no primeiro login
    users[idx].senha = bcrypt.hashSync(senha, 10);
  }
  users[idx].token = uuidv4();
  users[idx].lastLogin = new Date().toISOString();
  saveUsers(users);
  // Track successful login
  try {
    const sec = loadSecurity();
    sec.loginAttempts = [{ ip: req.ip, email, at: new Date().toISOString(), success: true }, ...(sec.loginAttempts || [])].slice(0, 500);
    saveSecurity(sec);
  } catch {}
  const u = users[idx];
  tracker.record('login', { email: u.email });
  audit.append('login', u.email, req.ip, { email: u.email, role: u.role || 'user' });
  res.json({
    success: true,
    token: u.token,
    user: { id: u.id, nome: u.nome, email: u.email, whatsapp: u.whatsapp, cpf: u.cpf, role: u.role || 'user' }
  });
});

app.get('/api/auth/me', (req, res) => {
  const u = getAuthUser(req);
  if (!u) return res.status(401).json({ error: 'Não autenticado.' });
  res.json({ success: true, user: { id: u.id, nome: u.nome, email: u.email, whatsapp: u.whatsapp, cpf: u.cpf, role: u.role || 'user' } });
});

app.put('/api/auth/profile', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  const users = loadUsers();
  const idx = users.findIndex(u => u.token === token);
  if (idx === -1) return res.status(401).json({ error: 'Sessão inválida.' });
  const { nome, whatsapp } = req.body || {};
  if (nome) users[idx].nome = nome.trim();
  if (whatsapp) users[idx].whatsapp = whatsapp.replace(/\D/g, '');
  saveUsers(users);
  const u = users[idx];
  res.json({ success: true, user: { id: u.id, nome: u.nome, email: u.email, whatsapp: u.whatsapp, cpf: u.cpf } });
});

app.put('/api/auth/password', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  const users = loadUsers();
  const idx = users.findIndex(u => u.token === token);
  if (idx === -1) return res.status(401).json({ error: 'Sessão inválida.' });
  const { senhaAtual, novaSenha } = req.body || {};
  const storedHash = users[idx].senha || '';
  const isBcryptHash = /^\$2[aby]\$/.test(storedHash);
  const currentOk = isBcryptHash ? bcrypt.compareSync(senhaAtual || '', storedHash) : storedHash === senhaAtual;
  if (!currentOk) return res.status(400).json({ error: 'Senha atual incorreta.' });
  if (!novaSenha || novaSenha.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
  users[idx].senha = bcrypt.hashSync(novaSenha, 10);
  saveUsers(users);
  res.json({ success: true });
});

app.get('/api/auth/orders', (req, res) => {
  const u = getAuthUser(req);
  if (!u) return res.status(401).json({ error: 'Não autenticado.' });
  const paymentsFilePath = path.join(__dirname, 'data', 'payments.json');
  let payments = [];
  try { payments = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf-8')); } catch (e) {}
  const orders = payments.filter(p => p.userId === u.id);
  res.json({ success: true, orders });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) {
    const users = loadUsers();
    const idx = users.findIndex(u => u.token === token);
    if (idx !== -1) { users[idx].token = null; saveUsers(users); }
  }
  res.json({ success: true });
});

// ======================================================

// ===================== ADDRESS ROUTES =====================

app.get('/api/auth/addresses', (req, res) => {
  const u = getAuthUser(req);
  if (!u) return res.status(401).json({ error: 'Não autenticado.' });
  res.json({ success: true, addresses: u.enderecos || [] });
});

app.post('/api/auth/addresses', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  const users = loadUsers();
  const idx = users.findIndex(u => u.token === token);
  if (idx === -1) return res.status(401).json({ error: 'Sessão inválida.' });
  const { nome, cep, rua, numero, complemento, bairro, cidade, estado, referencia, principal } = req.body || {};
  if (!nome || !cep || !rua || !numero || !bairro || !cidade || !estado) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }
  if (!users[idx].enderecos) users[idx].enderecos = [];
  const newAddress = {
    id: 'end_' + uuidv4().split('-')[0],
    principal: principal === true || users[idx].enderecos.length === 0,
    nome: nome.trim(),
    cep: cep.replace(/\D/g, ''),
    rua: rua.trim(),
    numero: numero.trim(),
    complemento: (complemento || '').trim(),
    bairro: bairro.trim(),
    cidade: cidade.trim(),
    estado: estado.toUpperCase().trim(),
    referencia: (referencia || '').trim()
  };
  if (newAddress.principal) {
    users[idx].enderecos.forEach(a => { a.principal = false; });
  }
  users[idx].enderecos.push(newAddress);
  saveUsers(users);
  res.json({ success: true, address: newAddress, addresses: users[idx].enderecos });
});

app.put('/api/auth/addresses/:id', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  const users = loadUsers();
  const idx = users.findIndex(u => u.token === token);
  if (idx === -1) return res.status(401).json({ error: 'Sessão inválida.' });
  if (!users[idx].enderecos) return res.status(404).json({ error: 'Endereço não encontrado.' });
  const aIdx = users[idx].enderecos.findIndex(a => a.id === req.params.id);
  if (aIdx === -1) return res.status(404).json({ error: 'Endereço não encontrado.' });
  const { nome, cep, rua, numero, complemento, bairro, cidade, estado, referencia, principal } = req.body || {};
  if (principal === true) {
    users[idx].enderecos.forEach(a => { a.principal = false; });
  }
  const cur = users[idx].enderecos[aIdx];
  users[idx].enderecos[aIdx] = {
    ...cur,
    nome: nome !== undefined ? nome.trim() : cur.nome,
    cep: cep !== undefined ? cep.replace(/\D/g, '') : cur.cep,
    rua: rua !== undefined ? rua.trim() : cur.rua,
    numero: numero !== undefined ? numero.trim() : cur.numero,
    complemento: complemento !== undefined ? complemento.trim() : cur.complemento,
    bairro: bairro !== undefined ? bairro.trim() : cur.bairro,
    cidade: cidade !== undefined ? cidade.trim() : cur.cidade,
    estado: estado !== undefined ? estado.toUpperCase().trim() : cur.estado,
    referencia: referencia !== undefined ? referencia.trim() : cur.referencia,
    principal: principal !== undefined ? principal : cur.principal
  };
  saveUsers(users);
  res.json({ success: true, address: users[idx].enderecos[aIdx], addresses: users[idx].enderecos });
});

app.delete('/api/auth/addresses/:id', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  const users = loadUsers();
  const idx = users.findIndex(u => u.token === token);
  if (idx === -1) return res.status(401).json({ error: 'Sessão inválida.' });
  if (!users[idx].enderecos) return res.status(404).json({ error: 'Endereço não encontrado.' });
  const aIdx = users[idx].enderecos.findIndex(a => a.id === req.params.id);
  if (aIdx === -1) return res.status(404).json({ error: 'Endereço não encontrado.' });
  const wasPrincipal = users[idx].enderecos[aIdx].principal;
  users[idx].enderecos.splice(aIdx, 1);
  if (wasPrincipal && users[idx].enderecos.length > 0) {
    users[idx].enderecos[0].principal = true;
  }
  saveUsers(users);
  res.json({ success: true, addresses: users[idx].enderecos });
});

app.patch('/api/auth/addresses/:id/principal', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  const users = loadUsers();
  const idx = users.findIndex(u => u.token === token);
  if (idx === -1) return res.status(401).json({ error: 'Sessão inválida.' });
  if (!users[idx].enderecos) return res.status(404).json({ error: 'Endereço não encontrado.' });
  const aIdx = users[idx].enderecos.findIndex(a => a.id === req.params.id);
  if (aIdx === -1) return res.status(404).json({ error: 'Endereço não encontrado.' });
  users[idx].enderecos.forEach(a => { a.principal = false; });
  users[idx].enderecos[aIdx].principal = true;
  saveUsers(users);
  res.json({ success: true, addresses: users[idx].enderecos });
});

// ── Visitor tracker beacon ────────────────────────────────────────────────────
app.post('/api/track/heartbeat', (req, res) => {
  res.status(204).end();
  try {
    const ip = req.ip || req.connection?.remoteAddress;
    const ua = req.headers['user-agent'] || '';
    tracker.heartbeat({ ...req.body, ip, ua });
  } catch {}
});

app.post('/api/track/event', (req, res) => {
  res.status(204).end();
  try {
    const { sessionId, type, data } = req.body || {};
    if (sessionId && type) tracker.record(type, { sessionId, ...(data || {}) });
  } catch {}
});

// ── Product stats — views, viewers now, recent activity ──────────────────────
app.get('/api/product-stats/:productId', (req, res) => {
  try {
    const id   = String(req.params.productId);
    const snap = tracker.snap();

    const prodData   = tracker.products.get(id);
    const totalViews = prodData ? prodData.views : 0;

    // Active sessions on this product in the last 5 minutes
    const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
    const sessionsOnProduct = snap.sessions.filter(s =>
      s.productId === id && new Date(s.lastSeen).getTime() > fiveMinsAgo
    );
    const viewingNow = sessionsOnProduct.length;

    // Recent purchase/checkout events in the last 12 hours
    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
    const sessionMap = new Map(snap.sessions.map(s => [s.id, s]));

    const activityEvents = snap.events
      .filter(ev => {
        if (!['checkout_start', 'pix_created', 'order_created'].includes(ev.type)) return false;
        return new Date(ev.at).getTime() > twelveHoursAgo;
      })
      .slice(0, 12)
      .map(ev => {
        const sess = ev.data.sessionId ? sessionMap.get(ev.data.sessionId) : null;
        return {
          type:    ev.type,
          city:    sess?.city    || null,
          country: sess?.country || null,
          at:      ev.at
        };
      });

    // Active viewers of this product with city info (for "viewing" notifications)
    const viewerNotifs = sessionsOnProduct
      .filter(s => s.city)
      .slice(0, 3)
      .map(s => ({ type: 'viewing', city: s.city, country: s.country, at: s.lastSeen }));

    res.json({
      views:          totalViews,
      viewingNow,
      recentActivity: [...viewerNotifs, ...activityEvents].slice(0, 8)
    });
  } catch (e) {
    res.json({ views: 0, viewingNow: 0, recentActivity: [] });
  }
});

// ======================================================

app.get('/devops/*', (req, res) => res.sendFile(path.join(publicPath, 'devops', 'index.html')));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`WhatsApp fallback para ${WHATSAPP_NUMBER}`);
  try {
    const sock = await initWhatsApp();
    console.log('WhatsApp conectado com sucesso');
  } catch (error) {
    console.error('Erro ao conectar ao WhatsApp:', error);
  }
  alerts.start();
});
