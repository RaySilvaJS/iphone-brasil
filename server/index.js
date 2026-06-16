require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const paymentRouter = require('./payment');
const { initWhatsApp, sendPaymentRequest } = require('./whatsapp');
const { v4: uuidv4 } = require('uuid');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 4000;
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '5511999999999';
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

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(publicPath));
app.use('/proofs', express.static(path.join(__dirname, 'data', 'proofs')));
app.use('/api/payment', paymentRouter);

// Rotas Administrativas - Movidas para cima para garantir prioridade
app.post('/api/admin/product', (req, res) => {
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

app.put('/api/admin/product/:id', (req, res) => {
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
const catalogDataPath = path.join(__dirname, '..', 'public', 'data');
const _catalogCache = {};

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

app.post('/api/admin/scrape-worten', async (req, res) => {
  const WORTEN_URL = 'https://www.worten.com.br/telemoveis-e-pacotes-tv/telemoveis-e-smartphones/iphone';
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new", // Use "new" para o novo modo headless, ou false para ver o navegador
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Navega até a URL, aguarda o carregamento da rede e adiciona um pequeno atraso
    await page.goto(WORTEN_URL, { waitUntil: 'networkidle2', timeout: 90000 }); // Aumentar timeout para 90s
    await page.waitForTimeout(5000); // Espera 5 segundos para a página estabilizar
    
    // Aguarda o seletor dos produtos aparecer (isso confirma que passamos pelo Cloudflare)
    await page.waitForSelector('.w-product-card', { timeout: 60000 }); // Aumentar timeout

    const data = await page.content(); // Pega o HTML da página após o JS ser executado
    const $ = cheerio.load(data);
    const products = loadProducts();
    let newProductsCount = 0;

    $('.w-product-card').each((i, element) => {
      const name = $(element).find('.w-product-card__title').text().trim();
      const priceEuro = $(element).find('.w-product-price__current').first().text().trim();
      const imageUrl = $(element).find('.w-product-card__image img').attr('data-src') || $(element).find('.w-product-card__image img').attr('src');
      const productLink = $(element).find('.w-product-card__image-link').attr('href');

      if (name && priceEuro && imageUrl) {
        // Clean and parse price
        const priceCleaned = priceEuro.replace('€', '').replace('.', '').replace(',', '.').trim();
        const price = parseFloat(priceCleaned);

        // Generate a simple ID (you might want a more robust solution)
        const id = 'worten-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-*|-*$/g, '');

        // Check for duplicates
        if (!products.some(p => p.id === id)) {
          const newProduct = {
            id: id,
            name: name,
            model: name.includes('iPhone') ? name.split('iPhone')[1].trim().split(' ')[0] : 'Desconhecido', // Basic model extraction
            price: price,
            priceOriginal: price, // For now, assume no promo
            condition: 'Novo', // Assume new for scraped products
            storage: 'Desconhecido', // This would require deeper scraping
            color: 'Variado', // This would require deeper scraping
            stock: 10, // Default stock
            sold: false,
            rating: 4.5, // Default rating
            reviews: 0,
            isNew: true,
            isPromo: false,
            promoPercent: 0,
            images: [imageUrl],
            specs: {
              Processador: 'A-Series',
              Memória: 'Variado',
              Bateria: 'Longa duração'
            },
            description: `Produto importado da Worten: ${name}.`
          };
          products.push(newProduct);
          newProductsCount++;
        }
      }
    });

    saveProducts(products);
    res.json({ success: true, message: `${newProductsCount} produtos importados da Worten.` });
  } catch (error) {
    console.error('Erro ao fazer scraping da Worten:', error);
    res.status(500).json({ success: false, error: 'Erro ao fazer scraping da Worten.' });
  } finally {
    if (browser) await browser.close(); // Garante que o navegador seja fechado
  }
});

// Novo endpoint para scraping da Swappie (com Axios)
app.post('/api/admin/scrape-swappie', async (req, res) => {
  const SWAPPIE_URL = 'https://swappie.com/iphone/';
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1000 });

    // Navega até a Swappie, aguarda o carregamento da rede e adiciona um pequeno atraso
    await page.goto(SWAPPIE_URL, { waitUntil: 'networkidle2', timeout: 90000 }); // Aumentar timeout para 90s
    await page.waitForTimeout(5000); // Espera 5 segundos para a página estabilizar

    // Aguarda que os cards de produtos estejam presentes na página
    await page.waitForSelector('.product-card', { timeout: 60000 }); // Aumentar timeout para 60s

    const data = await page.content();
    const $ = cheerio.load(data);
    const products = loadProducts();
    let newProductsCount = 0;

    // Itera sobre os cards de produtos da Swappie
    $('.product-card').each((i, element) => {
      const card = $(element);
      const name = card.find('h3').text().trim();
      // Encontra o preço procurando por elementos que contenham o símbolo €
      const priceText = card.find('p:contains("€"), span:contains("€")').first().text().trim();
      const imageUrl = card.find('img').attr('src');
      const productLink = card.attr('href');

      if (name && priceText && imageUrl) {
        // Limpeza do preço (ex: "1.234,56 €" -> 1234.56)
        const priceCleaned = priceText.replace('€', '').replace(/\s/g, '').replace('.', '').replace(',', '.').trim();
        const price = parseFloat(priceCleaned);

        const id = 'swappie-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-*|-*$/g, '');

        if (!products.some(p => p.id === id)) {
          const newProduct = {
            id: id,
            name: name,
            model: name.includes('iPhone') ? name.split('iPhone')[1].trim().split(' ')[0] : 'Desconhecido',
            price: price,
            priceOriginal: price,
            condition: 'Seminovo', // Swappie é especializado em seminovos
            storage: 'Desconhecido', // Pode ser extraído do nome ou de uma página de detalhes
            color: 'Variado',
            stock: 5, // Estoque padrão
            sold: false,
            rating: 4.8, // Avaliação padrão
            reviews: 0,
            isNew: false,
            isPromo: false,
            promoPercent: 0,
            images: [imageUrl],
            specs: {
              Processador: 'A-Series',
              Memória: 'Variado',
              Bateria: 'Longa duração'
            },
            description: `Produto importado da Swappie: ${name}. Veja mais em https://swappie.com${productLink}`
          };
          products.push(newProduct);
          newProductsCount++;
        }
      }
    });

    saveProducts(products);
    res.json({ success: true, message: `${newProductsCount} produtos importados da Swappie.` });
  } catch (error) {
    console.error('Erro ao fazer scraping da Swappie:', error);
    res.status(500).json({ success: false, error: 'Erro ao fazer scraping da Swappie.' });
  } finally {
    if (browser) await browser.close();
  }
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

// ===================== AUTH ROUTES =====================

app.post('/api/auth/register', (req, res) => {
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
    senha,
    token: null,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  saveUsers(users);
  res.json({ success: true, message: 'Cadastro realizado com sucesso.' });
});

app.post('/api/auth/login', (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }
  const users = loadUsers();
  const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase().trim() && u.senha === senha);
  if (idx === -1) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  users[idx].token = uuidv4();
  saveUsers(users);
  const u = users[idx];
  res.json({
    success: true,
    token: u.token,
    user: { id: u.id, nome: u.nome, email: u.email, whatsapp: u.whatsapp, cpf: u.cpf }
  });
});

app.get('/api/auth/me', (req, res) => {
  const u = getAuthUser(req);
  if (!u) return res.status(401).json({ error: 'Não autenticado.' });
  res.json({ success: true, user: { id: u.id, nome: u.nome, email: u.email, whatsapp: u.whatsapp, cpf: u.cpf } });
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
  if (users[idx].senha !== senhaAtual) return res.status(400).json({ error: 'Senha atual incorreta.' });
  if (!novaSenha || novaSenha.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
  users[idx].senha = novaSenha;
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

// ======================================================

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
});
