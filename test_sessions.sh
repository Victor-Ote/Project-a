#!/bin/bash
# Script para testar os endpoints de debug de sessões via curl
# Use: bash test_sessions.sh

# ====================================
# CONFIGURAÇÃO
# ====================================
BASE_URL="http://localhost:3000"
TOKEN="mytoken123456"  # Altere para seu token

echo "=========================================="
echo "Debug Sessions API - Teste via Curl"
echo "=========================================="
echo "Token: $TOKEN"
echo "Base URL: $BASE_URL"
echo ""

# ====================================
# TESTE 1: LISTAR SESSÕES
# ====================================
echo "[1] Listando sessões..."
echo "GET $BASE_URL/api/t/$TOKEN/sessions"
echo ""

curl -s -X GET "$BASE_URL/api/t/$TOKEN/sessions" | jq '.'

echo ""
echo "=========================================="
echo ""

# ====================================
# TESTE 2: LIMPAR SESSÕES
# ====================================
echo "[2] Limpando todas as sessões..."
echo "POST $BASE_URL/api/t/$TOKEN/sessions/clear"
echo ""

curl -s -X POST "$BASE_URL/api/t/$TOKEN/sessions/clear" | jq '.'

echo ""
echo "=========================================="
echo ""

# ====================================
# TESTE 3: LISTAR APÓS LIMPEZA
# ====================================
echo "[3] Listando sessões após limpeza..."
echo "GET $BASE_URL/api/t/$TOKEN/sessions"
echo ""

curl -s -X GET "$BASE_URL/api/t/$TOKEN/sessions" | jq '.'

echo ""
echo "=========================================="
echo "Testes concluídos!"
echo "=========================================="
