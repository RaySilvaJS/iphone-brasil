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
let _botPeer   = null;  // entidade do bot cacheada
let _botId     = null;  // ID numérico do bot cacheado
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
  _client  = await buildClient(session);
  _botPeer = null; // reseta cache ao reconectar
  _botId   = null;
  vxLog('info', 'Cliente conectado.');
  return _client;
}

async function getBotPeer(client) {
  if (_botPeer && _botId) return { botPeer: _botPeer, botId: _botId };
  vxLog('info', `Resolvendo entidade de @${BOT_USERNAME}...`);
  _botPeer = await client.getEntity(BOT_USERNAME);
  _botId   = _botPeer.id?.value ?? _botPeer.id;
  vxLog('info', `Bot ID: ${_botId} (cacheado)`);
  return { botPeer: _botPeer, botId: _botId };
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

// ── Aguarda próxima mensagem do bot (qualquer) ───────────────────────────────

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
        const peerId = msg.peerId?.userId?.value ?? msg.peerId?.userId;
        if (!peerId || String(peerId) !== String(botNumericId)) return;
        done = true;
        clearTimeout(timer);
        try { client.removeEventHandler(handler, filter); } catch {}
        resolve(msg);
      } catch {}
    };

    const filter = new NewMessage({});
    client.addEventHandler(handler, filter);
  });
}

// ── Aguarda mensagem do bot que contenha código PIX ──────────────────────────
// O bot pode enviar "⏳ Aguarde..." antes do PIX real — continua esperando.

function waitForPixMessage(client, botNumericId, timeoutMs = 45000) {
  const { NewMessage } = loadGramJS();
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { client.removeEventHandler(handler, filter); } catch {}
      reject(new Error(`Timeout: PIX não chegou em ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const handler = (event) => {
      if (done) return;
      try {
        const msg = event?.message;
        if (!msg || msg.out) return;
        const peerId = msg.peerId?.userId?.value ?? msg.peerId?.userId;
        if (!peerId || String(peerId) !== String(botNumericId)) return;

        const text = msg.message || msg.text || '';
        vxLog('info', `Mensagem do bot recebida: "${text.slice(0, 80)}"`);

        // Resolve se tiver código PIX
        if (extractPixCode(text)) {
          done = true;
          clearTimeout(timer);
          try { client.removeEventHandler(handler, filter); } catch {}
          resolve(msg);
          return;
        }

        // Falha rápido se o bot enviar mensagem de erro (evita esperar 45s de timeout)
        const isError = /❌|não foi possível|tente novamente|erro interno|falha ao|serviço indisponível/i.test(text);
        if (isError) {
          done = true;
          clearTimeout(timer);
          try { client.removeEventHandler(handler, filter); } catch {}
          reject(new Error(`Bot retornou erro: ${text.slice(0, 120)}`));
          return;
        }

        // Mensagens de loading (⏳ Aguarde...) são ignoradas — continua esperando
      } catch {}
    };

    const filter = new NewMessage({});
    client.addEventHandler(handler, filter);
  });
}

// ── Detecta e aciona botão DEPOSITAR (inline ou teclado) ─────────────────────
// Retorna 'inline' | 'keyboard' | 'text' conforme o que foi feito.
// Se inline: invoke GetBotCallbackAnswer mas NÃO envia texto (evita duplo-disparo).
// Se teclado: envia o texto exato do botão.

async function clickDepositar(client, botPeer, startMsg) {
  const { Api } = loadGramJS();
  try {
    // GramJS nem sempre popula replyMarkup no evento — se não vier, busca a msg completa
    let msg = startMsg;
    if (!msg?.replyMarkup?.rows) {
      vxLog('info', 'replyMarkup ausente no evento — buscando mensagem completa por ID...');
      const fetched = await client.getMessages(botPeer, { ids: [startMsg.id] });
      msg = fetched[0];
    }
    if (!msg?.replyMarkup?.rows) {
      vxLog('warn', 'Mensagem /start sem replyMarkup — tentando texto');
      await client.sendMessage(botPeer, { message: '📥 DEPOSITAR' });
      return 'text';
    }

    for (const row of msg.replyMarkup.rows) {
      for (const btn of row.buttons) {
        if (!(btn.text || '').toUpperCase().includes('DEPOSITAR')) continue;

        if (btn.data !== undefined && btn.data !== null) {
          // Botão inline — dispara sem await: p2 já escuta a resposta do bot,
          // não precisa esperar a confirmação do callback pelo Telegram (~1-3s)
          vxLog('info', `Botão inline encontrado: "${btn.text}" — disparando clique (fire & forget)`);
          client.invoke(new Api.messages.GetBotCallbackAnswer({
            peer:  botPeer,
            msgId: msg.id,
            data:  Buffer.from(btn.data),
          })).catch(e => vxLog('warn', `GetBotCallbackAnswer: ${e.message}`));
          return 'inline';

        } else {
          // Botão de teclado de resposta (sem callback data)
          vxLog('info', `Botão teclado encontrado: "${btn.text}" — enviando como texto`);
          await client.sendMessage(botPeer, { message: btn.text });
          return 'keyboard';
        }
      }
    }
  } catch (e) {
    vxLog('warn', `clickDepositar falhou: ${e.message} — usando texto como fallback`);
  }

  // Fallback final
  vxLog('info', 'Fallback: enviando "📥 DEPOSITAR" como texto');
  await client.sendMessage(botPeer, { message: '📥 DEPOSITAR' });
  return 'text';
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

    const client              = await getClient();
    const { botPeer, botId } = await getBotPeer(client);

    // ── Passo 1: /start ───────────────────────────────────────────────────────
    vxLog('info', 'Passo 1: Enviando /start');
    const p1 = waitForBotMessage(client, botId, 20000);
    await client.sendMessage(botPeer, { message: '/start' });
    const startMsg = await p1;
    vxLog('info', 'Menu inicial recebido', { text: (startMsg.message || '').slice(0, 150) });

    // ── Passo 2: DEPOSITAR ────────────────────────────────────────────────────
    vxLog('info', 'Passo 2: Acionando DEPOSITAR');
    const p2 = waitForBotMessage(client, botId, 25000);
    const clickType = await clickDepositar(client, botPeer, startMsg);
    vxLog('info', `DEPOSITAR acionado via: ${clickType}`);
    const depositMsg = await p2;
    vxLog('info', 'Resposta DEPOSITAR recebida', { text: (depositMsg.message || '').slice(0, 150) });

    // ── Passo 3: Valor ────────────────────────────────────────────────────────
    // toFixed(2) corrige float impreciso; vírgula como decimal evita ambiguidade
    // com separador de milhar (11361.86 com ponto pode ser lido como 11 pelo bot)
    // Exemplos: 11361.86 → "11361,86" | 11.00 → "11" | 11.50 → "11,5"
    const amountStr = String(parseFloat(parseFloat(amount).toFixed(2))).replace('.', ',');
    vxLog('info', `Passo 3: Enviando valor: "${amountStr}"`);
    // waitForPixMessage ignora mensagens intermediárias ("⏳ Aguarde...")
    // e só resolve quando chegar mensagem com o código PIX real.
    const p3 = waitForPixMessage(client, botId, 45000);
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
