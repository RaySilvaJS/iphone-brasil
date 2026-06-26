# BOT WHATSAPP AUTÔNOMO — IMPLEMENTAÇÃO SEM ALTERAR O SITE
**Data:** 2026-06-26 | Repositório: iphone-brasil

---

## Visão Geral

Este documento descreve a implementação do módulo de bot autônomo para WhatsApp, construído de forma a **não modificar nenhuma funcionalidade existente do site em produção**.

O bot começa **completamente desligado** (`enabled: false`). Nenhum cliente recebe respostas automáticas até que o administrador habilite e configure o bot. O grupo admin funciona exatamente como antes — todos os comandos `APROVADO`, `RECUSADO`, `REENVIAR`, `PAGO` e o encaminhamento de mídia continuam inalterados.

---

## Arquivos Criados (Novos)

```
server/
├── bot/
│   ├── bot-logger.js           → Logger para server/data/bot/logs.json
│   ├── catalog-reader.js       → Consulta read-only dos catálogos de produtos
│   ├── conversation-store.js   → Histórico e contexto por cliente (conversations.json)
│   ├── customer-handler.js     → Dispatcher principal de mensagens diretas
│   ├── intent-engine.js        → Detecção de intenção por palavras-chave
│   └── message-sanitizer.js    → Remoção de dados sensíveis (cartão, CVV, senhas)
└── data/
    └── bot/
        ├── config.json         → Configuração do bot (bot desligado por padrão)
        ├── conversations.json  → Histórico de conversas (max 30 msgs/cliente)
        └── logs.json           → Logs de operação do bot (max 500 entradas)

tests/
└── bot/
    └── bot.test.js             → Suite de testes (64 testes, CJS puro)

docs/
└── BOT_WHATSAPP_SEM_ALTERAR_SITE.md  → Este arquivo
```

## Arquivos Modificados (Existentes)

| Arquivo | Mudança |
|---|---|
| `server/whatsapp.js` | +15 linhas no handler `messages.upsert` — adiciona branch para mensagens diretas de clientes, sem tocar no código do grupo admin |

### Diff exato em `server/whatsapp.js`

**Antes:**
```javascript
const jid = message.key.remoteJid;
if (jid !== WHATSAPP_GROUP_ID) return;

const msgContent = message.message;
```

**Depois:**
```javascript
const jid = message.key.remoteJid;

// ── Mensagens diretas de clientes → bot autônomo ──────────────────────
// O fluxo do grupo admin (abaixo) continua INALTERADO.
if (jid !== WHATSAPP_GROUP_ID) {
  // Ignorar status@broadcast e outros grupos
  if (jid === 'status@broadcast' || jid.endsWith('@g.us')) return;
  // Redirecionar mensagens diretas ao bot (desligado por padrão)
  try {
    const { handleCustomerMessage } = require('./bot/customer-handler');
    await handleCustomerMessage(sock, message, WHATSAPP_GROUP_ID);
  } catch (botErr) {
    // Erros do bot nunca afetam o servidor nem o grupo admin
    console.error('[BOT] Erro no handler de cliente:', botErr?.message || botErr);
  }
  return;
}

const msgContent = message.message;
```

**Garantias desta mudança:**
- Se `handleCustomerMessage` lançar erro → apenas log, nunca crash da conexão WA
- Se `config.json` não existir → fallback para `enabled: false`, bot silencioso
- Mensagens do grupo admin (WHATSAPP_GROUP_ID) chegam **exatamente como antes**
- status@broadcast e outros grupos são ignorados silenciosamente

---

## Configuração do Bot (`server/data/bot/config.json`)

```json
{
  "enabled": false,
  "mode": "allowlist",
  "allowedTestPhones": [],
  "maxRepliesPerMinute": 6,
  "ignoreMessagesOlderThanSeconds": 60,
  "campaignCodes": [],
  "siteUrl": "",
  "conversationTtlDays": 30
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `enabled` | boolean | Liga/desliga o bot. **Padrão: false.** |
| `mode` | `"allowlist"` \| `"public"` | `allowlist` = só numeros em `allowedTestPhones`; `public` = todos os clientes |
| `allowedTestPhones` | array de strings | Números que podem testar o bot em modo allowlist (ex: `["5511999991234"]`) |
| `maxRepliesPerMinute` | number | Limite de respostas por cliente por minuto |
| `ignoreMessagesOlderThanSeconds` | number | Ignora mensagens mais antigas que X segundos (evita spam de backlog) |
| `campaignCodes` | array | Códigos de campanha de anúncios (ver seção Campanhas) |
| `siteUrl` | string | URL base da loja (ex: `https://jessi.iphones.com.br`). Usado nos links de produto. |
| `conversationTtlDays` | number | Apaga conversas inativas após X dias |

### Como habilitar para teste

1. Edite `server/data/bot/config.json`
2. Adicione o número de teste em `allowedTestPhones` (só dígitos, com DDI): `["5511999991234"]`
3. Defina `"siteUrl": "https://seusite.com.br"` para links clicáveis
4. Mude `"enabled": true`
5. Reinicie o servidor

### Como habilitar para produção

1. Mude `"mode": "public"` (todos os clientes serão respondidos)
2. Garanta que `siteUrl` está correto
3. Mude `"enabled": true`
4. Reinicie o servidor

> **Nota:** Não é necessário `enabled: true` para o site funcionar. O bot é completamente opcional.

---

## Intents Detectadas

| Intent | Exemplo de mensagem | Resposta do bot |
|---|---|---|
| `greeting` | "oi", "bom dia", "olá" | Apresentação + menu de opções |
| `search_product` | "tem iphone 15?" | Busca no catálogo + card do produto |
| `ask_price` | "quanto custa?" | Preço do produto em contexto |
| `ask_pix` | "tem desconto no pix?" | Fallback seguro: confirmar no checkout |
| `ask_installments` | "parcela em 12x?" | Fallback seguro: confirmar no checkout |
| `ask_gift` | "vem com brinde?" | Fallback seguro: confirmar na oferta |
| `ask_color` | "tem em azul?" | Cores disponíveis via siblings |
| `ask_storage` | "tem 256gb?" | Armazenamentos via siblings |
| `ask_availability` | "tem estoque?" | Disponibilidade real do catálogo |
| `buy_intent` | "quero comprar", "me manda o link" | Link direto do produto |
| `cheaper_option` | "tem algo mais barato?" | Produtos com preço menor no catálogo |
| `similar_products` | "tem modelo semelhante?" | Produtos relacionados no catálogo |
| `ask_order_status` | "onde está meu pedido?", "PED12345" | Status do pedido via payments.json |
| `proof_of_payment` | "já paguei o pix" | Instrução para enviar imagem do comprovante |
| `campaign_code` | "vim pelo anúncio AD-IP15" | Produto da campanha + contexto de origem |
| `unknown` | qualquer outra coisa | Menu de ajuda padrão |

---

## O Bot NÃO inventa dados

| Pergunta | O bot NÃO diz | O bot DIZ |
|---|---|---|
| "tem desconto no pix?" | "Sim, 5% de desconto no PIX!" | "As condições de PIX são confirmadas no checkout" |
| "parcela em quantas vezes?" | "12x sem juros!" | "As condições de parcelamento são confirmadas no checkout" |
| "tem brinde?" | "Sim, vem com AirPod!" | "Os brindes são confirmados no checkout e na oferta ativa" |
| "quanto em estoque?" | número de estoque | Frase vaga baseada em `stock > 0` do JSON |

Isso evita discrepâncias com o `loja-oficial.js` (que cria promoções fake no localStorage do browser).

---

## Fluxo de Comprovante via Bot

```
Cliente envia imagem/PDF → bot detecta (mediaType)
         ↓
Busca pedidos pending/awaiting_validation pelo telefone do cliente
         ↓
  ┌── 0 pedidos ──────────────────────────────────────────────────────────┐
  │  Bot pede que cliente informe o código do pedido                      │
  └───────────────────────────────────────────────────────────────────────┘
         ↓
  ┌── 2+ pedidos ─────────────────────────────────────────────────────────┐
  │  Bot pede que cliente informe o shortId (PED12345)                    │
  └───────────────────────────────────────────────────────────────────────┘
         ↓
  ┌── 1 pedido ───────────────────────────────────────────────────────────┐
  │  Bot encaminha imagem ao grupo admin com caption contendo:            │
  │  - shortId, orderId completo, produto, valor, telefone, hora          │
  │  - Instruções: APROVADO #PED12345 / RECUSADO #PED12345 [motivo]       │
  │                                                                        │
  │  Bot responde ao cliente: "Comprovante recebido e enviado. ✅"         │
  │  (NUNCA diz "aprovado" automaticamente)                                │
  └───────────────────────────────────────────────────────────────────────┘
```

**O status do pedido em `payments.json` NÃO é alterado pelo bot.** Apenas o admin pode aprovar/recusar via os comandos existentes no grupo.

---

## Segurança de Dados

O módulo `message-sanitizer.js` detecta e redige antes de armazenar no histórico:

| Padrão | Substituição |
|---|---|
| Número de cartão (13-19 dígitos) | `[CARTÃO OCULTADO]` |
| CVV (`cvv: 123`) | `[CVV OCULTADO]` |
| Data de validade (`12/26`) | `[VALIDADE OCULTADA]` |
| Senha (`senha: xxx`) | `[SENHA OCULTADA]` |
| Token | `[TOKEN OCULTADO]` |
| Código SMS/OTP | `[CÓDIGO OCULTADO]` |

Se dados sensíveis são detectados na mensagem, o bot envia automaticamente:

> *"Para sua segurança, não envie dados de cartão, CVV, senha ou código de confirmação pelo WhatsApp. Utilize somente o checkout seguro do site."*

---

## Códigos de Campanha

Formato: `AD-XXXXX` (maiúsculas, prefixo `AD-`).

Exemplo de configuração em `config.json`:

```json
{
  "campaignCodes": [
    {
      "code": "AD-IP15",
      "active": true,
      "source": "Instagram Ads",
      "productId": "MLB1027172667"
    }
  ]
}
```

Quando o cliente envia "vim pelo anúncio AD-IP15", o bot:
1. Identifica o código
2. Busca o produto associado no catálogo
3. Exibe o card do produto com preço e link
4. Salva o contexto de campanha na conversa

---

## Rate Limiting e Anti-Spam

- Máximo de `maxRepliesPerMinute` respostas por cliente por janela de 60s
- Mensagens mais antigas que `ignoreMessagesOlderThanSeconds` são ignoradas silenciosamente
- IDs de mensagem são deduplicados (evita responder a mesma msg duas vezes)
- Conversas expiram após `conversationTtlDays` dias sem atividade

---

## Histórico de Conversas

Cada cliente tem uma entrada em `server/data/bot/conversations.json`:

```json
{
  "5511999991234": {
    "phone": "5511999991234",
    "firstMessageAt": "2026-06-26T14:00:00.000Z",
    "lastMessageAt": "2026-06-26T14:05:00.000Z",
    "state": "browsing",
    "context": {
      "lastProductId": "MLB1027172667",
      "lastProductName": "Apple iPhone 15 (128 GB) - Azul",
      "lastProductQuery": "iphone 15",
      "campaignCode": "AD-IP15",
      "campaignSource": "Instagram Ads"
    },
    "history": [
      { "role": "user", "text": "tem iphone 15?", "at": "2026-06-26T14:00:01.000Z" },
      { "role": "bot",  "text": "Encontrei este produto...", "at": "2026-06-26T14:00:02.000Z" }
    ],
    "processedIds": ["MSGID001", "MSGID002"],
    "repliesInMinute": []
  }
}
```

**Limite:** máximo 30 mensagens no histórico por cliente. Mensagens antigas são removidas automaticamente.

---

## Como executar os testes

```bash
node tests/bot/bot.test.js
```

**Resultado esperado:** `64 passou  0 falhou`

Os testes verificam:
- Config inicial (bot desligado, modo allowlist, sem telefones)
- Sanitização de dados sensíveis
- Detecção de todas as intents (19 casos)
- Catalog reader com dados reais de catálogo
- Conversation store (CRUD + rate limit + deduplicação)
- Existência de todos os arquivos criados
- Git diff: nenhum arquivo proibido foi alterado
- Regras de negócio (fallback seguro para PIX, parcelamento, brindes)

---

## Limitações Conhecidas

1. **URL de produto:** Se `siteUrl` estiver vazio, os links serão relativos (`/product?id=X`) e não funcionarão no WhatsApp. O admin deve configurar `siteUrl` no `config.json`.

2. **Estoque não é decrementado:** O campo `stock` nos catálogos JSON não é atualizado em tempo real. O bot usa a mensagem correta: "aparece disponível no catálogo *neste momento*".

3. **Comprovante sem `proofGroupMessageId`:** Ao encaminhar um comprovante via bot, o admin deve responder incluindo o shortId (ex: `APROVADO #PED12345`) para que o sistema de identificação de pedidos (método 4 em `whatsapp.js`) funcione. Os demais métodos (1, 2, 3, 5) dependem de fluxos iniciados pelo checkout do site.

4. **Conversas não persistem em memória:** Cada mensagem lê e escreve `conversations.json`. Em alto volume (centenas de msgs/segundo), isso pode ser lento. Para escala, migrar para Map em memória com salvamento periódico.

5. **Sem NLP:** A detecção de intent é por palavras-chave. Mensagens com erros de ortografia graves ou estrutura incomum podem cair em `unknown`.

---

## Fases Futuras (Não implementadas)

**Fase 2 (com autorização):**
- Campos `pricePix`, `installmentsPlan`, `guarantee` nos produtos → respostas mais precisas
- Webhook ou endpoint para recarregar catálogo sem reiniciar o bot
- Interface admin para visualizar/limpar conversas

**Fase 3 (com autorização):**
- Notificação proativa quando produto indisponível volta ao estoque
- Integração com Telegram para notificar leads identificados pelo bot
- Dashboard de conversas no painel DevOps

---

## Segurança de Produção

| Risco | Mitigação |
|---|---|
| Bot ligado sem querer | `enabled: false` por padrão. Requer mudança explícita no config |
| Spam de cliente | Rate limit por `maxRepliesPerMinute` |
| Dados de cartão capturados | `hasSensitiveData` + `sanitize` antes de armazenar |
| Aprovação automática de pagamento | **Impossível** — bot nunca altera `payments.json` |
| Crash do bot derrubar conexão WA | try/catch em torno de `handleCustomerMessage` no whatsapp.js |
| Interferência com grupo admin | Código do grupo admin nunca é executado se `jid !== WHATSAPP_GROUP_ID` |
