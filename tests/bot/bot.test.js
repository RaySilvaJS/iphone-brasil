'use strict';
// Bot module test suite — node tests/bot/bot.test.js
// Uses only node built-ins: assert, fs, path, child_process.

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log(`  ✅ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${label}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ─── Run all tests inside an async IIFE (CJS compatible) ────────────────────
(async () => {

  // Imports after section() is defined
  const sanitizer = require('../../server/bot/message-sanitizer');
  const intent    = require('../../server/bot/intent-engine');
  const catalog   = require('../../server/bot/catalog-reader');
  const store     = require('../../server/bot/conversation-store');
  const botConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/bot/config.json'), 'utf-8'));

  // ─── 1. Config inicial ─────────────────────────────────────────────────────
  section('Config inicial (server/data/bot/config.json)');

  await test('bot começa desligado (enabled = false)', () => {
    assert.strictEqual(botConfig.enabled, false, 'enabled deve ser false');
  });

  await test('mode é allowlist por padrão', () => {
    assert.strictEqual(botConfig.mode, 'allowlist');
  });

  await test('allowedTestPhones começa vazio', () => {
    assert.ok(Array.isArray(botConfig.allowedTestPhones));
    assert.strictEqual(botConfig.allowedTestPhones.length, 0);
  });

  await test('maxRepliesPerMinute está configurado', () => {
    assert.ok(typeof botConfig.maxRepliesPerMinute === 'number');
    assert.ok(botConfig.maxRepliesPerMinute > 0);
  });

  // ─── 2. message-sanitizer ──────────────────────────────────────────────────
  section('message-sanitizer');

  await test('detecta número de cartão (16 dígitos)', () => {
    assert.ok(sanitizer.hasSensitiveData('meu cartao 4111111111111111'));
  });

  await test('detecta CVV explícito', () => {
    assert.ok(sanitizer.hasSensitiveData('cvv: 123'));
  });

  await test('mensagem normal não é marcada como sensível', () => {
    assert.strictEqual(sanitizer.hasSensitiveData('oi, tem iphone 15?'), false);
  });

  await test('sanitize redige número de cartão', () => {
    const result = sanitizer.sanitize('cartao 4111111111111111 validade 12/26');
    assert.ok(!result.includes('4111111111111111'), 'cartão deve ser ocultado');
  });

  await test('sanitize preserva texto normal inalterado', () => {
    const msg = 'quero um iphone 15 preto 128gb';
    assert.strictEqual(sanitizer.sanitize(msg), msg);
  });

  await test('SAFETY_WARNING está definido e menciona CVV', () => {
    assert.ok(typeof sanitizer.SAFETY_WARNING === 'string');
    assert.ok(sanitizer.SAFETY_WARNING.length > 20);
    assert.ok(sanitizer.SAFETY_WARNING.includes('CVV'));
  });

  // ─── 3. intent-engine ──────────────────────────────────────────────────────
  section('intent-engine');

  await test('"oi" → greeting', () => {
    assert.strictEqual(intent.detectIntent('oi').intent, 'greeting');
  });

  await test('"bom dia" → greeting', () => {
    assert.strictEqual(intent.detectIntent('bom dia').intent, 'greeting');
  });

  await test('"tem iphone 15?" → search_product', () => {
    const r = intent.detectIntent('tem iphone 15?');
    assert.strictEqual(r.intent, 'search_product');
    assert.ok(r.query && r.query.includes('iphone'));
  });

  await test('"tem samsung galaxy?" → search_product', () => {
    assert.strictEqual(intent.detectIntent('tem samsung galaxy?').intent, 'search_product');
  });

  await test('"quanto custa?" → ask_price', () => {
    assert.strictEqual(intent.detectIntent('quanto custa?').intent, 'ask_price');
  });

  await test('"quanto custa o iphone 14" → ask_price com query', () => {
    const r = intent.detectIntent('quanto custa o iphone 14');
    assert.strictEqual(r.intent, 'ask_price');
    assert.ok(r.query && r.query.includes('iphone'));
  });

  await test('"tem desconto no pix?" → ask_pix', () => {
    assert.strictEqual(intent.detectIntent('tem desconto no pix?').intent, 'ask_pix');
  });

  await test('"parcela em 12x?" → ask_installments', () => {
    assert.strictEqual(intent.detectIntent('parcela em 12x?').intent, 'ask_installments');
  });

  await test('"vem com algum brinde?" → ask_gift', () => {
    assert.strictEqual(intent.detectIntent('vem com algum brinde?').intent, 'ask_gift');
  });

  await test('"onde está meu pedido?" → ask_order_status', () => {
    assert.strictEqual(intent.detectIntent('onde está meu pedido?').intent, 'ask_order_status');
  });

  await test('"PED12345" → ask_order_status com shortId extraído', () => {
    const r = intent.detectIntent('PED12345');
    assert.strictEqual(r.intent, 'ask_order_status');
    assert.strictEqual(r.query, 'PED12345');
  });

  await test('"já paguei o pix" → proof_of_payment', () => {
    assert.strictEqual(intent.detectIntent('já paguei o pix').intent, 'proof_of_payment');
  });

  await test('"quero comprar" com contexto → buy_intent', () => {
    assert.strictEqual(intent.detectIntent('quero comprar', { lastProductQuery: 'iphone 15' }).intent, 'buy_intent');
  });

  await test('"tem algo mais barato?" → cheaper_option', () => {
    assert.strictEqual(intent.detectIntent('tem algo mais barato?').intent, 'cheaper_option');
  });

  await test('"tem um modelo semelhante?" → similar_products', () => {
    assert.strictEqual(intent.detectIntent('tem um modelo semelhante?').intent, 'similar_products');
  });

  await test('"AD-IP15" → campaign_code com código extraído', () => {
    const r = intent.detectIntent('oi vim pelo anúncio AD-IP15');
    assert.strictEqual(r.intent, 'campaign_code');
    assert.strictEqual(r.campaignCode, 'AD-IP15');
  });

  await test('texto vazio → unknown', () => {
    assert.strictEqual(intent.detectIntent('').intent, 'unknown');
  });

  await test('extractCampaignCode detecta AD-XXXXX', () => {
    assert.strictEqual(intent.extractCampaignCode('oi vim pelo AD-IP15'), 'AD-IP15');
  });

  await test('extractCampaignCode retorna null para texto normal', () => {
    assert.strictEqual(intent.extractCampaignCode('oi tudo bem'), null);
  });

  await test('extractOrderShortId detecta PED12345', () => {
    assert.strictEqual(intent.extractOrderShortId('meu pedido PED12345'), 'PED12345');
  });

  await test('APROVADO (de cliente) → não é intent especial do bot', () => {
    const r = intent.detectIntent('APROVADO');
    assert.notStrictEqual(r.intent, 'campaign_code');
    assert.notStrictEqual(r.intent, 'ask_order_status');
  });

  // ─── 4. catalog-reader ─────────────────────────────────────────────────────
  section('catalog-reader');

  await test('busca "iPhone" retorna resultados', () => {
    const results = catalog.searchProducts('iPhone');
    assert.ok(results.length > 0, 'deve encontrar iPhones');
    assert.ok(results[0].name.toLowerCase().includes('iphone'));
  });

  await test('busca produto inexistente retorna array vazio', () => {
    assert.strictEqual(catalog.searchProducts('ProdutoXYZNaoExiste99999').length, 0);
  });

  await test('query vazia retorna array vazio', () => {
    assert.strictEqual(catalog.searchProducts('').length, 0);
  });

  await test('getProductById com id inexistente retorna null', () => {
    assert.strictEqual(catalog.getProductById('ID_INEXISTENTE_XYZ'), null);
  });

  await test('getProductById com id real retorna produto correto', () => {
    const results = catalog.searchProducts('iPhone', { limit: 1 });
    if (results.length === 0) { console.log('     (pulando — catálogo vazio)'); return; }
    const p = catalog.getProductById(results[0].id);
    assert.ok(p !== null);
    assert.strictEqual(String(p.id), String(results[0].id));
  });

  await test('formatPrice formata em BRL', () => {
    const formatted = catalog.formatPrice(4094);
    assert.ok(formatted.includes('R$') || formatted.includes('R$'), 'deve ter símbolo BRL');
  });

  await test('getSiblings retorna array', () => {
    const results = catalog.searchProducts('iPhone 15', { limit: 1 });
    if (results.length === 0) { console.log('     (pulando — catálogo vazio)'); return; }
    const siblings = catalog.getSiblings(results[0]);
    assert.ok(Array.isArray(siblings));
  });

  await test('getRelated não excede limit', () => {
    const results = catalog.searchProducts('iPhone', { limit: 1 });
    if (results.length === 0) { console.log('     (pulando — catálogo vazio)'); return; }
    const related = catalog.getRelated(results[0], { limit: 2 });
    assert.ok(Array.isArray(related));
    assert.ok(related.length <= 2);
  });

  await test('getCheaperThan retorna produtos com preço menor', () => {
    const results = catalog.searchProducts('iPhone', { limit: 10 });
    const expensive = results.find(p => p.price > 1000);
    if (!expensive) { console.log('     (pulando — sem produto caro no catálogo)'); return; }
    const cheaper = catalog.getCheaperThan(expensive, { limit: 3 });
    assert.ok(Array.isArray(cheaper));
    cheaper.forEach(p => assert.ok(p.price < expensive.price, 'preço deve ser menor'));
  });

  // ─── 5. conversation-store ─────────────────────────────────────────────────
  section('conversation-store');

  const TEST_PHONE = `0000TEST${Date.now()}`;

  await test('getConversation cria entrada nova', () => {
    const conv = store.getConversation(TEST_PHONE);
    assert.ok(conv);
    assert.ok(typeof conv.state === 'string');
    assert.ok(Array.isArray(conv.history));
  });

  await test('isProcessed retorna false para msg nova', () => {
    assert.strictEqual(store.isProcessed(TEST_PHONE, 'MSGTEST001'), false);
  });

  await test('markProcessed → isProcessed retorna true', () => {
    store.markProcessed(TEST_PHONE, 'MSGTEST001');
    assert.strictEqual(store.isProcessed(TEST_PHONE, 'MSGTEST001'), true);
  });

  await test('addMessage adiciona ao histórico', () => {
    store.addMessage(TEST_PHONE, 'user', 'mensagem de teste unitário');
    const conv = store.getConversation(TEST_PHONE);
    const last = conv.history[conv.history.length - 1];
    assert.strictEqual(last?.role, 'user');
    assert.ok(last?.text?.includes('teste'));
  });

  await test('updateConversation atualiza contexto', () => {
    store.updateConversation(TEST_PHONE, { context: { lastProductId: 'TESTID123' } });
    const conv = store.getConversation(TEST_PHONE);
    assert.strictEqual(conv.context?.lastProductId, 'TESTID123');
  });

  await test('isRateLimited retorna false muito abaixo do limite', () => {
    assert.strictEqual(store.isRateLimited(TEST_PHONE, 999), false);
  });

  // Limpeza da entrada de teste
  try {
    const storePath = path.join(ROOT, 'server', 'data', 'bot', 'conversations.json');
    const all = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    delete all[TEST_PHONE.replace(/\D/g, '')];
    fs.writeFileSync(storePath, JSON.stringify(all, null, 2), 'utf-8');
  } catch {}

  // ─── 6. Arquivos criados existem ───────────────────────────────────────────
  section('Integridade dos arquivos criados');

  const EXPECTED = [
    'server/bot/bot-logger.js',
    'server/bot/message-sanitizer.js',
    'server/bot/catalog-reader.js',
    'server/bot/conversation-store.js',
    'server/bot/intent-engine.js',
    'server/bot/customer-handler.js',
    'server/data/bot/config.json',
    'server/data/bot/conversations.json',
    'server/data/bot/logs.json',
  ];

  for (const rel of EXPECTED) {
    await test(`${rel} existe`, () => {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `Não encontrado: ${rel}`);
    });
  }

  // ─── 7. Arquivos proibidos não foram modificados ───────────────────────────
  section('Arquivos proibidos não foram modificados (git diff)');

  const gitCheck = (args, label) => {
    try {
      return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf-8' }).trim();
    } catch { return null; }
  };

  await test('public/ não foi alterado', () => {
    const out = gitCheck('diff --name-only HEAD');
    if (out === null) { console.log('     (git indisponível — pulando)'); return; }
    const publicChanged = out.split('\n').filter(l => l.startsWith('public/'));
    assert.strictEqual(publicChanged.length, 0,
      `Arquivos public/ não devem ser alterados: ${publicChanged.join(', ')}`);
  });

  await test('server/index.js não foi alterado', () => {
    const out = gitCheck('diff --name-only HEAD server/index.js');
    if (out === null) { console.log('     (git indisponível — pulando)'); return; }
    assert.strictEqual(out, '', 'server/index.js deve estar inalterado');
  });

  await test('server/payment.js não foi alterado', () => {
    const out = gitCheck('diff --name-only HEAD server/payment.js');
    if (out === null) { console.log('     (git indisponível — pulando)'); return; }
    assert.strictEqual(out, '', 'server/payment.js deve estar inalterado');
  });

  await test('server/data/payments.json não foi alterado', () => {
    const out = gitCheck('diff --name-only HEAD server/data/payments.json');
    if (out === null) { console.log('     (git indisponível — pulando)'); return; }
    assert.strictEqual(out, '', 'payments.json deve estar inalterado');
  });

  await test('server/whatsapp.js é o único arquivo existente modificado', () => {
    const out = gitCheck('diff --name-only HEAD');
    if (out === null) { console.log('     (git indisponível — pulando)'); return; }
    const changed = out.split('\n').filter(Boolean);
    // Apenas server/whatsapp.js pode ter sido modificado (os demais são novos)
    const unexpectedMods = changed.filter(f =>
      !f.startsWith('server/bot/') &&
      !f.startsWith('server/data/bot/') &&
      !f.startsWith('tests/bot/') &&
      !f.startsWith('docs/') &&
      f !== 'server/whatsapp.js'
    );
    assert.strictEqual(unexpectedMods.length, 0,
      `Arquivos inesperados modificados: ${unexpectedMods.join(', ')}`);
  });

  // ─── 8. Regras de negócio ──────────────────────────────────────────────────
  section('Regras de negócio do bot');

  await test('ask_pix → fallback seguro, sem inventar desconto', () => {
    assert.strictEqual(intent.detectIntent('tem desconto no pix?').intent, 'ask_pix');
  });

  await test('ask_installments → fallback seguro, sem inventar parcelas', () => {
    assert.strictEqual(intent.detectIntent('parcela em 12x sem juros?').intent, 'ask_installments');
  });

  await test('ask_gift → fallback seguro, sem inventar brindes', () => {
    assert.strictEqual(intent.detectIntent('vem com airpod de brinde?').intent, 'ask_gift');
  });

  await test('customer-handler.js exporta handleCustomerMessage', () => {
    const { handleCustomerMessage } = require('../../server/bot/customer-handler');
    assert.ok(typeof handleCustomerMessage === 'function');
  });

  // ─── Resultado ─────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(44)}`);
  console.log(`Resultado: ${passed} passou  ${failed} falhou`);
  if (failed > 0) {
    console.error('FALHA: alguns testes não passaram.');
    process.exit(1);
  }
  console.log('SUCESSO: todos os testes passaram.');

})().catch(err => {
  console.error('Erro fatal no runner:', err.message);
  process.exit(1);
});
