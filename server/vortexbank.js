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

  try { if (_pendingClient) await _pendingClient.disconnect(); } catch {}

  const { Api } = loadGramJS();
  _pendingClient = await buildClient('');

  const result = await _pendingClient.invoke(
    new Api.auth.SendCode({
      phoneNumber: phone,
      apiId,
      apiHash,
      settings: new Api.CodeSettings({}),
    })
  );
  _pendingCodeHash = result.phoneCodeHash;

  vxLog('info', 'Código enviado com sucesso.');
  return true;
}

// ── Auth: step 2 — verify code ────────────────────────────────────────────────

async function verifyCode(phone, code) {
  if (!_pendingClient) throw new Error('Inicie o envio do código antes de verificar.');
  if (!_pendingCodeHash) throw new Error('phoneCodeHash ausente. Reenvie o código.');

  vxLog('info', 'Verificando código de autenticação...');
  const { Api } = loadGramJS();

  try {
    await _pendingClient.invoke(
      new Api.auth.SignIn({
        phoneNumber:   phone,
        phoneCodeHash: _pendingCodeHash,
        phoneCode:     code,
      })
    );
  } catch (e) {
    if (e.message?.includes('SESSION_PASSWORD_NEEDED')) {
      throw new Error('Esta conta tem 2FA ativado. Desative a verificação em 2 etapas no Telegram e tente novamente.');
    }
    if (e.message?.includes('PHONE_CODE_INVALID')) {
      throw new Error('Código inválido ou expirado. Verifique o código recebido no Telegram.');
    }
    throw e;
  }

  const sessionStr = _pendingClient.session.save();
  saveSession(String(sessionStr));

  _client          = _pendingClient;
  _pendingClient   = null;
  _pendingCodeHash = null;

  vxLog('info', 'Autenticação concluída e sessão salva.');
  return true;
}

// ── Wait for next message from the bot ───────────────────────────────────────
// Handler SÍNCRONO — async handlers no GramJS podem causar unhandled rejections
// que derrubam o processo se event.message vier undefined em algum evento.

function waitForBotMessage(client, botNumericId, timeoutMs = 25000) {
  const { NewMessage } = loadGramJS();

  return new Promise((resolve, reject) => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { client.removeEventHandler(handler, filter); } catch {}
      reject(new Error(`Timeout: @${BOT_USERNAME} não respondeu em ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const handler = (event) => {
      if (done) return;
      try {
        const msg = event?.message;
        if (!msg || msg.out) return;
        // Compara pelo ID numérico do bot (evita lookup async no handler)
        const peerId = msg.peerId?.userId?.value ?? msg.peerId?.userId;
        if (!peerId || String(peerId) !== String(botNumericId)) return;
        done = true;
        clearTimeout(timer);
        try { client.removeEventHandler(handler, filter); } catch {}
        resolve(msg);
      } catch { /* ignora erros de parsing do evento */ }
    };

    const filter = new NewMessage({});
    client.addEventHandler(handler, filter);
  });
}

// ── Extract PIX code from text ────────────────────────────────────────────────

function extractPixCode(text) {
  if (!text) return null;

  // 1. Linha imediatamente após o label "PIX Copia e Cola:"
  const afterLabel = text.match(/pix\s+copia\s+e\s+cola[:\s]*\n([^\n]+)/i);
  if (afterLabel) return afterLabel[1].trim();

  // 2. Qualquer linha que começa com 000201 (EMV BR Code)
  const emvLine = text.match(/^(000201[^\n]+)$/m);
  if (emvLine) return emvLine[1].trim();

  return null;
}

// ── Main: generate PIX ────────────────────────────────────────────────────────

async function generatePix(amount) {
  if (_busy) throw new Error('VortexBank ocupado. Aguarde a operação atual terminar.');
  _busy = true;

  try {
    vxLog('info', `Iniciando geração de PIX VortexBank — Valor: R$ ${amount}`);

    const client  = await getClient();

    // Resolve entidade do bot uma vez — pega ID numérico para filtro rápido
    vxLog('info', `Resolvendo entidade de @${BOT_USERNAME}...`);
    const botPeer   = await client.getEntity(BOT_USERNAME);
    const botId     = botPeer.id?.value ?? botPeer.id;
    vxLog('info', `Bot ID: ${botId}`);

    // ── Passo 1: /start ───────────────────────────────────────────────────────
    vxLog('info', 'Passo 1: Enviando /start');
    const p1 = waitForBotMessage(client, botId, 20000);
    await client.sendMessage(botPeer, { message: '/start' });
    const startMsg = await p1;
    vxLog('info', 'Menu inicial recebido', { text: (startMsg.message || '').slice(0, 150) });

    // ── Passo 2: DEPOSITAR ────────────────────────────────────────────────────
    // VortexBank usa reply keyboard (não inline). Simula pressionar o botão
    // enviando o texto exato do botão como mensagem.
    vxLog('info', 'Passo 2: Enviando "📥 DEPOSITAR"');
    const p2 = waitForBotMessage(client, botId, 20000);
    await client.sendMessage(botPeer, { message: '📥 DEPOSITAR' });
    const depositMsg = await p2;
    vxLog('info', 'Resposta DEPOSITAR recebida', { text: (depositMsg.message || '').slice(0, 150) });

    // ── Passo 3: Valor ────────────────────────────────────────────────────────
    // Envia sem zeros desnecessários: 11.00 → "11", 11.50 → "11.5"
    const amountStr = String(parseFloat(amount));
    vxLog('info', `Passo 3: Enviando valor: "${amountStr}"`);
    const p3 = waitForBotMessage(client, botId, 35000);
    await client.sendMessage(botPeer, { message: amountStr });

    const pixMsg = await p3;
    const rawText = pixMsg.message || pixMsg.text || '';
    vxLog('info', 'Resposta com PIX recebida', { hasMedia: !!(pixMsg.media), textLen: rawText.length });

    // ── Extração do código PIX ────────────────────────────────────────────────
    const pixCode = extractPixCode(rawText);
    vxLog('info', `Código PIX extraído: ${pixCode ? pixCode.slice(0, 50) + '...' : 'NÃO ENCONTRADO'}`);

    if (!pixCode) {
      const preview = rawText.slice(0, 300);
      vxLog('error', 'Código PIX não encontrado na resposta', { preview });
      throw new Error(`Bot não retornou código PIX reconhecível. Resposta: "${preview}"`);
    }

    const result = {
      ok:          true,
      amount:      parseFloat(amount),
      pixCode,
      rawMessage:  rawText,
      generatedAt: new Date().toISOString(),
    };

    _lastGen = { at: result.generatedAt, amount: result.amount, ok: true };
    vxLog('info', `PIX gerado — código: ${pixCode.slice(0, 30)}...`);
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
