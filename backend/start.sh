#!/bin/bash

# Script para iniciar o backend Python

cd "$(dirname "$0")"

# Verifica se o ambiente virtual existe
if [ ! -d "venv" ]; then
    echo "📦 Criando ambiente virtual..."
    python3 -m venv venv
fi

# Ativa o ambiente virtual
source venv/bin/activate

# Instala dependências
echo "📥 Instalando dependências..."
pip install -r requirements.txt

# Inicia o servidor
echo "🚀 Iniciando servidor na porta 8000..."
uvicorn main:app --reload --host 0.0.0.0 --port 8000
