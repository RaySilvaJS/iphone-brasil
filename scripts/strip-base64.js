const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const FILES = ['iphones.json', 'androids.json', 'smartwatches.json', 'consoles.json', 'acessorios.json', 'informatica.json'];

FILES.forEach(filename => {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`[SKIP] ${filename} — não encontrado`);
    return;
  }

  const beforeBytes = fs.statSync(filePath).size;
  console.log(`[READ] ${filename} — ${(beforeBytes / 1024 / 1024).toFixed(1)} MB`);

  const raw = fs.readFileSync(filePath, 'utf-8');
  const products = JSON.parse(raw);

  let totalBefore = 0;
  let totalAfter = 0;
  let productsWithNoImages = 0;

  const cleaned = products.map(p => {
    const before = (p.images || []).length;
    const filtered = (p.images || []).filter(img => typeof img === 'string' && img.startsWith('http'));
    totalBefore += before;
    totalAfter += filtered.length;
    if (filtered.length === 0) productsWithNoImages++;
    return { ...p, images: filtered };
  });

  fs.writeFileSync(filePath, JSON.stringify(cleaned), 'utf-8');

  const afterBytes = fs.statSync(filePath).size;
  console.log(`[DONE] ${filename}`);
  console.log(`       Tamanho: ${(beforeBytes / 1024 / 1024).toFixed(1)} MB → ${(afterBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`       Imagens: ${totalBefore} total → ${totalAfter} mantidas (${totalBefore - totalAfter} base64 removidas)`);
  console.log(`       Produtos sem imagem URL: ${productsWithNoImages}/${cleaned.length}`);
  console.log('');
});

console.log('Concluído!');
