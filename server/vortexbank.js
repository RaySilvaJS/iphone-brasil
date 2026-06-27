'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// VORTEXBANK — Integração de teste via Telegram MTProto (GramJS)
//
// Fluxo: /start → seleciona DEPOSITAR → envia valor → captura QR Code + PIX
//
// Isolado do sistema de pagamento principal. Usado apenas pelo DevOps.
// ══════════════════════════════════════════════════════════════════════════════

const path = require('path');
const fs   = require('fs');

const CONFIG_PATH   = path.join(__dirname, 'data', 'config.json');
const VX_LOG_PATH   = path.join(__dirname, 'data', 'vortexbank-logs.json');
const BOT_USERNAME  = 'VortexBank_bot';

// ── Logging ──────────────────────────────────────────────────────────────────

const _logs = [];
const MAX_LOGS = 200;

function vxLog(level, msg, data) {
  const entry = {
    ts:    Date.now(),
    level,
    msg,
    data:  data !== undefined ? String(JSON.stringify(data)).slice(0, 400) : null,
  };
  _logs.unshift(entry);
  if (_logs.length > MAX_LOGS) _logs.length = MAX_LOGS;
  console.log(`[VortexBank][${level.toUpperCase()}] ${msg}${data ? ' | ' + JSON.stringify(data).slice(0, 120) : ''}`);
  try { fs.writeFileSync(VX_LOG_PATH, JSON.stringify(_logs.slice(0, 50), null, 2)); } catch {}
}

function getLogs() { return _logs.slice(0, 100); }

// ── Config helpers ────────────────────────────────────────────────────────────

const loadConfig = () => {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch { return {}; }
};
const saveConfig = (c) => fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2));

function getCredentials() {
  const cfg   = loadConfig();
  const vx    = cfg.vortexbank || {};
  const apiId = parseInt(process.env.VORTEXBANK_TG_API_ID || vx.apiId || '0');
  const apiHash = process.env.VORTEXBANK_TG_API_HASH || vx.apiHash || '';
  return { apiId, apiHash };
}

function getSavedSession() {
  return process.env.VORTEXBANK_TG_SESSION || loadConfig().vortexbank?.session || '';
}

function saveSession(str) {
  const cfg = loadConfig();
  if (!cfg.vortexbank) cfg.vortexbank = {};
  cfg.vortexbank.session = str;
  saveConfig(cfg);
  vxLog('info', 'Sessão Telegram salva.');
}

// ── Status ────────────────────────────────────────────────────────────────────

function getStatus() {
  const { apiId, apiHash } = getCredentials();
  const hasSession = !!getSavedSession();
  return {
    configured:  !!(apiId && apiHash),
    hasSession,
    busy:        _busy,
    lastGen:     _lastGen,
    lastError:   _lastErr,
  };
}

// ── State ─────────────────────────────────────────────────────────────────────

let _client    = null;  // GramJS TelegramClient
let _busy      = false;
let _lastGen   = null;  // { at, amount, ok }
let _lastErr   = null;  // { at, message }
let _pendingCodeHash = null;
let _pendingClient   = null;

// ── GramJS loader (lazy — avoids crash if package missing) ───────────────────

function loadGramJS() {
  try {
    const { TelegramClient } = require('telegram');
    const { StringSession }  = require('telegram/sessions');
    const { NewMessage }     = require('telegram/events');
    const { Api }            = require('telegram');
    return { TelegramClient, StringSession, NewMessage, Api };
  } catch (e) {
    throw new Error('Pacote "telegram" não instalado. Execute: npm install telegram');
  }
}

// ── Build / reuse client ──────────────────────────────────────────────────────

async function buildClient(sessionStr) {
  const { TelegramClient, StringSession } = loadGramJS();
  const { apiId, apiHash } = getCredentials();
  if (!apiId || !apiHash) throw new Error('API_ID e API_HASH não configurados. Acesse Config VortexBank.');

  const session = new StringSession(sessionStr || '');
  const client  = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
    timeout:           30,
    requestRetries:    2,
    useWSS:            false,
    deviceModel:       'Desktop',
    systemVersion:     'Windows 11',
    appVersion:        '1.0.0',
    langCode:          'pt',
  });
  await client.connect();
  return client;
}

async function getClient() {
  if (_client && _client.connected) return _client;
  const session = getSavedSession();
  if (!session) throw new Error('Sessão não encontrada. Configure e autentique primeiro.');
  vxLog('info', 'Conectando cliente Telegram...');
  _client = await buildClient(session);
  vxLog('info', 'Cliente conectado.');
  return _client;
}

// ── Auth: step 1 — send code ──────────────────────────────────────────────────

async function sendCode(phone) {
  vxLog('info', `Enviando código de verificação para ${phone.slice(0, 4)}****`);
  const { apiId, apiHash } = getCredentials();
  if (!apiId || !apiHash) throw new Error('Configure API_ID e API_HASH antes de autenticar.');

  // Disconnect existing pending client
  try { if (_pendingClient) await _pendingClient.disconnect(); } catch {}

  _pendingClient = await buildClient('');
  const result   = await _pendingClient.sendCode({ apiId, apiHash }, phone);
  _pendingCodeHash = result.phoneCodeHash;

  vxLog('info', 'Código enviado com sucesso.');
  return true;
}

// ── Auth: step 2 — verify code ────────────────────────────────────────────────

async function verifyCode(phone, code) {
  if (!_pendingClient) throw new Error('Inicie o envio do código antes de verificar.');
  if (!_pendingCodeHash) throw new Error('phoneCodeHash ausente. Reenvie o código.');

  vxLog('info', 'Verificando código de autenticação...');
  const { apiId, apiHash } = getCredentials();

  await _pendingClient.signIn(
    { apiId, apiHash },
    { phoneNumber: phone, phoneCode: () => Promise.resolve(code), phoneCodeHash: _pendingCodeHash }
  );

  const sessionStr = _pendingClient.session.save();
  saveSession(String(sessionStr));

  _client          = _pendingClient;
  _pendingClient   = null;
  _pendingCodeHash = null;

  vxLog('info', 'Autenticação concluída e sessão salva.');
  return true;
}

// ── Wait for next message from the bot ───────────────────────────────────────

function waitForBotMessage(client, timeoutMs = 25000) {
  const { NewMessage } = loadGramJS();

  return new Promise((resolve, reject) => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { client.removeEventHandler(handler, filter); } catch {}
      reject(new Error(`Timeout: @${BOT_USERNAME} não respondeu em ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const handler = async (event) => {
      if (done) return;
      const msg = event.message;
      if (msg.out) return; // ignore own messages
      try {
        const entity = await client.getEntity(msg.peerId).catch(() => null);
        const username = entity?.username || '';
        if (username.toLowerCase() !== BOT_USERNAME.toLowerCase()) return;
        done = true;
        clearTimeout(timer);
        try { client.removeEventHandler(handler, filter); } catch {}
        resolve(msg);
      } catch { /* ignore parse errors */ }
    };

    const filter = new NewMessage({});
    client.addEventHandler(handler, filter);
  });
}

// ── Click inline button by text match ────────────────────────────────────────

async function clickInlineButton(client, botPeer, msgId, btnTextFragment) {
  const { Api } = loadGramJS();
  try {
    const msgs = await client.getMessages(botPeer, { ids: [msgId] });
    const msg  = msgs[0];
    if (!msg?.replyMarkup?.rows) return false;

    for (const row of msg.replyMarkup.rows) {
      for (const btn of row.buttons) {
        if (btn.text && btn.text.toUpperCase().includes(btnTextFragment.toUpperCase())) {
          vxLog('info', `Clicando botão inline: "${btn.text}"`);
          await client.invoke(new Api.messages.GetBotCallbackAnswer({
            peer:  botPeer,
            msgId: msgId,
            data:  btn.data ? Buffer.from(btn.data) : Buffer.from(''),
          }));
          return true;
        }
      }
    }
  } catch (e) {
    vxLog('warn', `clickInlineButton falhou: ${e.message}`);
  }
  return false;
}

// ── Extract PIX code from text ────────────────────────────────────────────────

function extractPixCode(text) {
  if (!text) return null;

  // BR Code EMV pattern (starts with 00020126 or 000201)
  const emvMatch = text.match(/000201\S{40,}/);
  if (emvMatch) return emvMatch[0].replace(/\s.*/, '');

  // Common copia e cola labels
  const labeled = text.match(/(?:c[oó]pia[^\S\r\n]*e[^\S\r\n]*cola|pix|c[oó]digo)[:\s*\n]*([A-Za-z0-9.+\-_/=]{30,})/i);
  if (labeled) return labeled[1].trim();

  // Long alphanumeric block (common for PIX codes)
  const longBlock = text.match(/\b([A-Za-z0-9+/=]{50,})\b/);
  if (longBlock) return longBlock[1];

  return null;
}

// ── Main: generate PIX ────────────────────────────────────────────────────────

async function generatePix(amount) {
  if (_busy) throw new Error('VortexBank ocupado. Aguarde a operação atual terminar.');
  _busy = true;

  try {
    vxLog('info', `Iniciando geração de PIX VortexBank — Valor: R$ ${amount}`);

    const client  = await getClient();
    const botPeer = await client.getEntity(BOT_USERNAME);

    // ── Passo 1: /start ───────────────────────────────────────────────────────
    vxLog('info', 'Passo 1: Enviando /start');
    const p1 = waitForBotMessage(client, 20000);
    await client.sendMessage(botPeer, { message: '/start' });
    const startMsg = await p1;
    vxLog('info', 'Menu inicial recebido', { text: (startMsg.message || '').slice(0, 150) });

    // ── Passo 2: DEPOSITAR ────────────────────────────────────────────────────
    vxLog('info', 'Passo 2: Selecionando DEPOSITAR');
    const p2 = waitForBotMessage(client, 20000);

    // Tenta botão inline primeiro; cai em texto de teclado se falhar
    const clickedInline = await clickInlineButton(client, botPeer, startMsg.id, 'DEPOSITAR');
    if (!clickedInline) {
      vxLog('info', 'Botão inline não encontrado — enviando texto "📥 DEPOSITAR"');
      await client.sendMessage(botPeer, { message: '📥 DEPOSITAR' });
    }

    const depositMsg = await p2;
    vxLog('info', 'Resposta DEPOSITAR recebida', { text: (depositMsg.message || '').slice(0, 150) });

    // ── Passo 3: Valor ────────────────────────────────────────────────────────
    vxLog('info', `Passo 3: Enviando valor: ${amount}`);
    const p3 = waitForBotMessage(client, 35000);
    await client.sendMessage(botPeer, { message: String(amount) });

    const pixMsg = await p3;
    const rawText = pixMsg.message || pixMsg.text || '';
    vxLog('info', 'Resposta com PIX recebida', { hasMedia: !!(pixMsg.media), textLen: rawText.length });

    // ── Extração de dados ─────────────────────────────────────────────────────
    let qrCodeBase64 = null;
    const pixCode    = extractPixCode(rawText);

    if (pixMsg.media) {
      vxLog('info', 'Baixando imagem do QR Code...');
      try {
        const buf = await client.downloadMedia(pixMsg, { workers: 1 });
        if (buf) {
          qrCodeBase64 = Buffer.isBuffer(buf)
            ? buf.toString('base64')
            : Buffer.from(buf).toString('base64');
          vxLog('info', `QR Code baixado (${Math.round(qrCodeBase64.length * 0.75 / 1024)}KB)`);
        }
      } catch (e) {
        vxLog('warn', `Erro ao baixar QR Code: ${e.message}`);
      }
    }

    if (!pixCode && !qrCodeBase64) {
      const preview = rawText.slice(0, 300);
      vxLog('error', 'PIX não encontrado na resposta', { preview });
      throw new Error(`Resposta do bot não contém QR Code nem código PIX. Texto recebido: "${preview}"`);
    }

    const result = {
      ok:           true,
      amount:       parseFloat(amount),
      pixCode:      pixCode || null,
      qrCodeBase64: qrCodeBase64 || null,
      rawMessage:   rawText,
      generatedAt:  new Date().toISOString(),
    };

    _lastGen = { at: result.generatedAt, amount: result.amount, ok: true };
    vxLog('info', `PIX gerado — QR: ${!!qrCodeBase64}, código: ${!!pixCode}`);
    return result;

  } catch (err) {
    _lastErr = { at: new Date().toISOString(), message: err.message };
    vxLog('error', `Falha na geração do PIX: ${err.message}`);
    throw err;
  } finally {
    _busy = false;
  }
}

// ── Disconnect (cleanup) ──────────────────────────────────────────────────────

async function disconnect() {
  try {
    if (_client) { await _client.disconnect(); _client = null; }
    vxLog('info', 'Cliente desconectado.');
  } catch (e) {
    vxLog('warn', `Erro ao desconectar: ${e.message}`);
  }
}

// ── Save config (apiId / apiHash from DevOps UI) ──────────────────────────────

function saveApiConfig(apiId, apiHash) {
  const cfg = loadConfig();
  if (!cfg.vortexbank) cfg.vortexbank = {};
  cfg.vortexbank.apiId  = String(apiId).trim();
  cfg.vortexbank.apiHash = String(apiHash).trim();
  saveConfig(cfg);
  vxLog('info', 'Credenciais API Telegram salvas.');
}

module.exports = { generatePix, sendCode, verifyCode, getStatus, getLogs, disconnect, saveApiConfig };
