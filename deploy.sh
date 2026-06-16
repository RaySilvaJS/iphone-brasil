#!/bin/bash

echo "📦 Atualizando código..."
git fetch origin
git reset --hard origin/main

echo "📥 Instalando dependências..."
npm install

echo "🔄 Reiniciando PM2..."
pm2 reload all

echo "✅ Deploy finalizado com sucesso!"