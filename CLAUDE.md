# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Development with nodemon (auto-restart)
npm start        # Production start
```

Server runs on `http://localhost:4000`. No build step — all frontend is plain HTML/CSS/JS served statically.

## Architecture Overview

### Backend (`server/`)

Single Express server at `server/index.js` (~670 lines). All routes are defined inline there except payments and admin:

- `server/payment.js` — payment/order routes, mounted at `/api/payment`
- `server/admin.js` — DevOps admin API, mounted at `/api/admin`
- `server/whatsapp.js` — Baileys WhatsApp bot (auto-starts on server boot)
- `server/logger.js` — Must be `require`d first in `index.js`; overrides `console.log/error/warn` to capture logs into in-memory buffers for the DevOps panel

**Persistence:** All data is flat JSON files in `server/data/`:
- `users.json` — user accounts (token-based sessions, bcrypt passwords, `role` field for admin/superadmin)
- `payments.json` — orders with `groupMessageId`, `clientPhone`, `logs[]`, `status`
- `products.json` — custom product catalog (separate from public catalog JSONs)
- `security.json` — blocked IPs, login attempts, notifications
- `config.json` — maintenance mode flag, deploy history, app version
- `data/backups/` — backup archives
- `data/proofs/` — payment proof uploads (base64 decoded)

There is no database ORM. All helpers (`loadUsers`, `saveUsers`, etc.) are duplicated across files — do not introduce a shared module for this; follow the existing pattern.

### Frontend (`public/`)

**Two separate product sources** — this is the most important architectural detail:

1. **Catalog JSONs** (`public/data/*.json`): Static product catalogs sourced from Mercado Livre — `iphones.json`, `androids.json`, `consoles.json`, `smartwatches.json`, `acessorios.json`, `informatica.json`. These are read-only reference data. API: `GET /api/catalog/product/:id`

2. **Custom products** (`server/data/products.json`): Products added via the admin panel. API: `GET /api/products`

The main `index.html` queries both sources. Product pages (`product.html`) also resolve from both via `GET /api/catalog/product/:id`.

**Page JS is split into numbered files** under `public/pages/`:
- `index-1.js`, `index-2.js`, `index-3.js` — loaded by `index.html` in order
- `product-1.js`, `product-2.js` — loaded by `product.html`

`public/js/auth.js` — global user session helper (`window.Auth`). Reads from `localStorage` key `user-session`. Injected into every page header via `Auth.injectAuthNav()` on DOMContentLoaded.

`public/js/loja-oficial.js` — generates per-product UI extras (fake discount badge, gift, free shipping) stored in `localStorage` key `loja-oficial-extras`. Loaded before product scripts.

**Design system:** Light marketplace theme. CSS variables defined inline per HTML file (no shared stylesheet for pages — `styles.css` is only used by `admin.html`):
- `--blue: #2563EB`, `--yellow: #F59E0B`, `--green: #16A34A`, `--bg: #F1F5F9`
- Font: Inter from Google Fonts

### WhatsApp Bot Flow

Admin group ID from `WHATSAPP_GROUP_ID` env var. When a payment is created:
1. `sendPaymentRequest()` sends message to admin group → returns `messageId`
2. `payment.groupMessageId = messageId` is saved — this is the secure link
3. When admin **replies to that specific message**, `contextInfo.stanzaId === groupMessageId` matches the correct payment
4. Bot forwards the reply content (text, image, QR code, document) to `payment.clientPhone`

The dangerous fallback (linking to most-recent pending payment) was intentionally removed. Never re-add it.

### DevOps Panel

Accessible at `/devops`. Requires `ADMIN_TOKEN` from `.env` sent as `X-Admin-Token` header (or `?adminToken=` query param). All admin API routes at `/api/admin/*` use the `adminAuth` middleware in `server/admin.js`.

### Auth System

User auth (customers): token stored in `user.token` field in `users.json`, sent as `X-Auth-Token` header. Admin role: `user.role === 'admin' | 'superadmin'`.

`ADMIN_TOKEN` env var is a separate master key for the DevOps panel only — independent from the user system.

## Environment Variables

```
PORT=4000
WHATSAPP_NUMBER=     # fallback WhatsApp number for chat links
WHATSAPP_GROUP_ID=   # admin group JID (format: 120363...@g.us)
ADMIN_TOKEN=         # master key for /devops panel
MELHOR_ENVIO_TOKEN=  # shipping calculation API
ORIGIN_CEP=          # store origin CEP for shipping
```

## Key Patterns

- **IP blocking** middleware runs on every request, checks `security.json`
- **Maintenance mode** middleware skips `/api/admin` and `/devops` routes
- The wildcard `app.get('*')` route serves `index.html` — register all specific routes before it
- Product card "extras" (fake promotions) are client-side only via `loja-oficial-extras` in localStorage — they are not in the product data
