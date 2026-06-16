
# 🎁 iphone-vendas - Landing Page Premium

Uma landing page moderna e responsiva para venda de iPhones com galeria interativa, carrinho de compras, comparador de produtos e integração WhatsApp.

## ✨ Funcionalidades

### 🛍️ Catálogo de Produtos
- Grid responsivo com 4+ produtos
- Cards premium com hover effects
- Badges: "Novo", "Promoção", "Estoque Baixo"
- Rating visual com ⭐
- Preço original vs. desconto

### 🔍 Galeria Interativa
- Modal com imagem principal em alta qualidade
- Miniaturas para navegação rápida
- Zoom ao passar o mouse
- Swiper.js para carrosséis

### 📋 Filtros Avançados
- Filtro por modelo (13 Pro, 14, 14 Pro, 15)
- Filtro por condição (Novo, Seminovo)
- Filtro por cor (Grafite, Prateado, Dourado, Rosa)
- Filtro por preço máximo
- Botão Aplicar e Limpar

### 🛒 Carrinho de Compras
- Adicionar/remover products
- Ajustar quantidades
- Totalizador automático com impostos (15%)
- Drawer slide do lado (mobile-friendly)
- Persistência com LocalStorage
- Checkout via WhatsApp

### ⚖️ Comparador de Produtos
- Selecionar até 3 iPhones
- Tabela lado a lado com especificações
- Mostrar preço, avaliação, condição
- Botões diretos para comprar

### ❤️ Favoritos & Histórico
- Sistema de favoritos com ❤️
- Recentemente visualizados (até 10)
- Persistência com LocalStorage
- Notificações ao adicionar/remover

### 📱 Menu Mobile
- Hambúrguer responsivo
- Navigation completa
- Otimizado para telas pequenas (320px+)
- Animações suaves

### 💬 Chat WhatsApp
- Widget de chat flutuante
- Atendimento direto via WhatsApp
- Integração com produtos e carrinho
- Fallback para link (sem Baileys)

## 🎨 Design

- **Tema:** Dark mode premium
- **Cores:** Purple accent (#9d6cff), Verde sucesso (#4CAF50), Laranja promo (#ff9800)
- **Tipografia:** Inter + Space Grotesk
- **Animações:** Transitions suaves, fade-in, scale, slide
- **Layout:** CSS Grid + Flexbox responsivo

## 🚀 Instalação

### Pré-requisitos
- Node.js 14+
- npm ou yarn

### Setup

```bash
# Clonar repositório
git clone <seu-repo>
cd iphone-vendas

# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev

# Rodar em produção
npm start
```

Acesse: **http://localhost:4000**

## 📁 Estrutura

```
iphone-vendas/
├── public/
│   ├── index.html          # Página principal
│   ├── admin.html          # Painel admin
│   ├── app.js              # Lógica principal
│   ├── cart.js             # Sistema de carrinho
│   ├── compare.js          # Comparador
│   ├── admin.js            # Admin logic
│   └── styles.css          # Estilos completos
├── server/
│   ├── index.js            # Servidor Express
│   └── data/
│       └── products.json   # Banco de dados (JSON)
└── package.json
```

## 🔧 API Endpoints

### Produtos
- `GET /api/products` - Listar (com filtros)
- `GET /api/products/:id` - Detalhes
- `POST /api/products/:id/sold` - Marcar como vendido

### Admin
- `POST /api/admin/product` - Adicionar produto

### Chat
- `POST /api/chat` - Enviar mensagem WhatsApp

## 📊 Estrutura de Dados

### Product Object
```json
{
  "id": "iphone-13-pro",
  "name": "iPhone 13 Pro",
  "model": "13 Pro",
  "price": 3899,
  "priceOriginal": 4299,
  "condition": "Novo",
  "color": "Grafite",
  "stock": 6,
  "sold": false,
  "rating": 4.9,
  "reviews": 132,
  "isNew": true,
  "isPromo": true,
  "promoPercent": 10,
  "images": ["url1", "url2", "url3"],
  "specs": {
    "Tela": "6.1\" Super Retina XDR",
    "Processador": "A15 Bionic",
    "Memória": "128GB",
    "Câmera": "Tripla 12MP",
    "Bateria": "Até 22h de vídeo"
  },
  "description": "Performance topo de linha..."
}
```

## 🎯 Requisitos de Performance

- ✅ Responsivo (320px+)
- ✅ Lazy loading de imagens
- ✅ Animações 60fps
- ✅ LocalStorage para cache
- 🔄 Lighthouse 80+ (próximo)

## 🌐 Requisitos de Browser

- Chrome/Edge (últimas 2 versões)
- Firefox (últimas 2 versões)
- Safari (últimas 2 versões)
- Mobile browsers

## 🔐 Variáveis de Ambiente

```bash
PORT=4000
WHATSAPP_NUMBER=5511999999999
USE_BAILEYS=false  # true para Baileys SDK
```

## 📝 Customização

### Editar Produtos
1. Abra `server/data/products.json`
2. Adicione/edite products
3. Reinicie o servidor

### Adicionar Produtos via Admin
1. Acesse `/admin`
2. Preencha o formulário
3. Clique "Adicionar"

### Mudar Cores
Edite as variáveis CSS em `public/styles.css`:
```css
:root {
  --accent: #9d6cff;
  --accent-2: #7f5bff;
  --blue: #6fd8ff;
  /* ... */
}
```

## 🚢 Deploy

### Vercel
```bash
npm install -g vercel
vercel
```

### Heroku
```bash
heroku create your-app
git push heroku main
```

### Docker
```bash
docker build -t iphone-vendas .
docker run -p 4000:4000 iphone-vendas
```

## 📞 Suporte

- Email: jessi.iphones@example.com
- WhatsApp: Clique no widget do site
- Issues: GitHub

## 📄 Licença

MIT License - veja LICENSE para detalhes

## 🙏 Agradecimentos

- Express.js
- Swiper.js
- Google Fonts (Inter, Space Grotesk)
- WhatsApp API

---

**Desenvolvido com ❤️ para jessi.iphones_**
