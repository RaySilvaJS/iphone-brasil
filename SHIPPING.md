Melhor Envio - Integração de Frete

Variáveis de ambiente necessárias (crie um arquivo `.env` na raiz):

- `MELHOR_ENVIO_CLIENT_ID` (opcional se usar token direto)
- `MELHOR_ENVIO_CLIENT_SECRET` (opcional)
- `MELHOR_ENVIO_TOKEN` (requerido) - token de acesso da API Melhor Envio
- `MELHOR_ENVIO_API_BASE` (opcional) - base URL da API (ex: https://api.melhorenvio.com.br)
- `ORIGIN_CEP` (opcional) - CEP de origem da loja (ex: 01001-000)

Uso

1. Instale dependências e execute o servidor:

```bash
npm install
npm start
```

2. Acesse `http://localhost:4000/checkout.html` e teste o fluxo de cálculo de frete.

Notas importantes

- O token `MELHOR_ENVIO_TOKEN` nunca é enviado ao frontend. Todas as consultas passam pelo backend (`/api/shipping`).
- O endpoint `/api/shipping` tenta consultar a API oficial. Se houver erro de comunicação, a resposta inclui um `fallback` com opções de exemplo.
- Ajuste o payload de `products` em `server/index.js` conforme as dimensões e pesos reais dos itens no carrinho.

Segurança

- Mantenha o arquivo `.env` fora do controle de versão.
