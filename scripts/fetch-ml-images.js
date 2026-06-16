const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const FILES = ['iphones.json', 'androids.json', 'smartwatches.json', 'consoles.json', 'acessorios.json', 'informatica.json'];

// Busca dados do item na API pública do ML (sem autenticação, para itens públicos)
const fetchMLItem = (id) => new Promise((resolve) => {
  const url = `https://api.mercadolibre.com/items/${id}`;
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        if (res.statusCode === 200) {
          const json = JSON.parse(data);
          const pics = (json.pictures || []).map(p => p.secure_url || p.url).filter(Boolean);
          if (!pics.length && json.thumbnail) pics.push(json.thumbnail);
          resolve(pics);
        } else {
          resolve([]);
        }
      } catch {
        resolve([]);
      }
    });
  }).on('error', () => resolve([]));
});

// Pausa para não bater rate limit do ML
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const processFile = async (filename) => {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) { console.log(`[SKIP] ${filename}`); return; }

  const products = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const mlProducts = products.filter(p => String(p.id).startsWith('MLB'));
  const nonMlProducts = products.filter(p => !String(p.id).startsWith('MLB'));

  console.log(`\n[${filename}] ${products.length} produtos — ${mlProducts.length} MLB, ${nonMlProducts.length} outros`);

  let done = 0;
  let found = 0;
  let failed = 0;

  // Processa em lotes de 5 simultâneos
  const BATCH = 5;
  for (let i = 0; i < mlProducts.length; i += BATCH) {
    const batch = mlProducts.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(p => fetchMLItem(p.id)));
    results.forEach((pics, j) => {
      if (pics.length) { mlProducts[i + j].images = pics; found++; }
      else failed++;
    });
    done += batch.length;
    process.stdout.write(`\r  Progresso: ${done}/${mlProducts.length} | ok: ${found} | sem imagem: ${failed}`);
    if (i + BATCH < mlProducts.length) await sleep(300); // 300ms entre lotes
  }

  console.log('');
  const updated = [...mlProducts, ...nonMlProducts];
  fs.writeFileSync(filePath, JSON.stringify(updated), 'utf-8');

  const afterBytes = fs.statSync(filePath).size;
  console.log(`  Salvo: ${(afterBytes / 1024 / 1024).toFixed(1)} MB | ${found} com imagens`);
};

(async () => {
  for (const file of FILES) {
    await processFile(file);
  }
  console.log('\nConcluído!');
})();
