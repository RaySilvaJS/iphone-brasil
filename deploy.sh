#!/bin/bash

echo "📦 Atualizando código..."
git fetch origin
git reset --hard origin/main

# Protege a sessão do WhatsApp de git clean acidental
mkdir -p server/auth_info

echo "📥 Instalando dependências..."
npm install --production

echo "🔄 Reiniciando PM2..."
# IMPORTANTE: usar "restart" (não "reload").
# "reload" sobe o processo novo ANTES de matar o velho — isso cria dois sockets
# WhatsApp simultâneos com as mesmas credenciais, o que faz o WA chutar a sessão
# com "loggedOut" e desativar a reconexão automática.
# "restart" mata o processo antigo PRIMEIRO, depois sobe o novo — sem overlap.
pm2 restart all

echo "✅ Deploy finalizado com sucesso!"
