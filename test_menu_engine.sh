#!/bin/bash

# =====================================================
# TESTE DO MOTOR DE FLUXO CONFIGURÁVEL
# =====================================================

TOKEN="seu_token_aqui"
BASE_URL="http://localhost:3000"

echo "🧪 Testando Motor de Fluxo Configurável"
echo "========================================"
echo ""

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# =====================================================
# 1. ATUALIZAR CONFIG COM NOVO FORMATO
# =====================================================
echo -e "${BLUE}1. Atualizando config com novo formato de menu...${NC}"

curl -X PUT "${BASE_URL}/api/t/${TOKEN}/config" \
  -H "Content-Type: application/json" \
  -d '{
    "menu": {
      "entryTriggers": ["menu", "start", "#menu"],
      "homeStep": "INICIO",
      "steps": {
        "INICIO": {
          "message": "🤖 Menu de Teste\n\n1️⃣ Ir para Opções\n2️⃣ Resposta Rápida\n9️⃣ Repetir\n0️⃣ Sair",
          "routes": {
            "1": { "type": "GOTO", "to": "OPCOES" },
            "2": { "type": "REPLY", "text": "✅ Esta é uma resposta rápida!" },
            "9": { "type": "HOME" },
            "0": { "type": "END", "text": "👋 Até logo!" },
            "menu": { "type": "HOME" }
          }
        },
        "OPCOES": {
          "message": "📋 Opções\n\n1️⃣ Opção A\n2️⃣ Opção B\n9️⃣ Voltar\n0️⃣ Menu Principal",
          "routes": {
            "1": { "type": "REPLY", "text": "✅ Você escolheu A" },
            "2": { "type": "REPLY", "text": "✅ Você escolheu B" },
            "9": { "type": "BACK" },
            "0": { "type": "HOME" },
            "voltar": { "type": "BACK" },
            "menu": { "type": "HOME" }
          }
        }
      }
    },
    "rules": [],
    "settings": {
      "defaultMessage": "👋 Olá! Digite menu para começar.",
      "windowSeconds": 86400
    }
  }'

echo ""
echo -e "${GREEN}✅ Config atualizada!${NC}"
echo ""
sleep 2

# =====================================================
# 2. VERIFICAR CONFIG SALVA
# =====================================================
echo -e "${BLUE}2. Verificando config salva no banco...${NC}"

RESPONSE=$(curl -s "${BASE_URL}/api/t/${TOKEN}/config")
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

echo ""
echo -e "${GREEN}✅ Config recuperada do DB${NC}"
echo ""
sleep 2

# =====================================================
# 3. LISTAR SESSÕES ATIVAS
# =====================================================
echo -e "${BLUE}3. Listando sessões ativas...${NC}"

SESSIONS=$(curl -s "${BASE_URL}/api/t/${TOKEN}/sessions")
echo "$SESSIONS" | jq '.' 2>/dev/null || echo "$SESSIONS"

COUNT=$(echo "$SESSIONS" | jq -r '.count' 2>/dev/null || echo "0")
echo ""
echo -e "${YELLOW}📊 Sessões ativas: ${COUNT}${NC}"
echo ""
sleep 2

# =====================================================
# 4. LIMPAR SESSÕES (SE NECESSÁRIO)
# =====================================================
if [ "$COUNT" -gt 0 ]; then
  echo -e "${BLUE}4. Limpando sessões existentes...${NC}"
  
  CLEAR_RESULT=$(curl -s -X POST "${BASE_URL}/api/t/${TOKEN}/sessions/clear")
  echo "$CLEAR_RESULT" | jq '.' 2>/dev/null || echo "$CLEAR_RESULT"
  
  CLEARED=$(echo "$CLEAR_RESULT" | jq -r '.cleared' 2>/dev/null || echo "0")
  echo ""
  echo -e "${GREEN}✅ ${CLEARED} sessões removidas${NC}"
  echo ""
else
  echo -e "${BLUE}4. Nenhuma sessão ativa para limpar${NC}"
  echo ""
fi

sleep 2

# =====================================================
# 5. INSTRUÇÕES DE TESTE MANUAL
# =====================================================
echo ""
echo -e "${YELLOW}=====================================${NC}"
echo -e "${YELLOW}🧪 TESTE MANUAL NO WHATSAPP${NC}"
echo -e "${YELLOW}=====================================${NC}"
echo ""
echo "Agora teste no WhatsApp conectado:"
echo ""
echo -e "1️⃣  Digite: ${GREEN}menu${NC}"
echo "   → Deve mostrar: Menu de Teste com 4 opções"
echo ""
echo -e "2️⃣  Digite: ${GREEN}1${NC}"
echo "   → Deve ir para: Opções (GOTO)"
echo "   → Stack deve ter: [INICIO]"
echo ""
echo -e "3️⃣  Digite: ${GREEN}1${NC}"
echo "   → Deve responder: ✅ Você escolheu A (REPLY)"
echo "   → Step mantém: OPCOES"
echo ""
echo -e "4️⃣  Digite: ${GREEN}9${NC}"
echo "   → Deve voltar para: INICIO (BACK)"
echo "   → Stack deve estar vazio"
echo ""
echo -e "5️⃣  Digite: ${GREEN}2${NC}"
echo "   → Deve responder: ✅ Esta é uma resposta rápida! (REPLY)"
echo "   → Step mantém: INICIO"
echo ""
echo -e "6️⃣  Digite: ${GREEN}0${NC}"
echo "   → Deve responder: 👋 Até logo! (END)"
echo "   → Sessão deve ser removida"
echo ""
echo -e "7️⃣  Verifique sessões novamente:"
echo "   curl -s ${BASE_URL}/api/t/${TOKEN}/sessions | jq"
echo ""

# =====================================================
# 6. EXEMPLO DE MENU COMPLETO
# =====================================================
echo ""
echo -e "${YELLOW}=====================================${NC}"
echo -e "${YELLOW}📦 EXEMPLO DE MENU COMPLETO${NC}"
echo -e "${YELLOW}=====================================${NC}"
echo ""
echo "Para menu mais completo, use:"
echo ""
echo -e "${BLUE}curl -X PUT ${BASE_URL}/api/t/${TOKEN}/config \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d @menu_example_new_format.json${NC}"
echo ""
echo "Arquivo: menu_example_new_format.json"
echo ""

# =====================================================
# 7. COMANDOS ÚTEIS
# =====================================================
echo ""
echo -e "${YELLOW}=====================================${NC}"
echo -e "${YELLOW}🛠️  COMANDOS ÚTEIS${NC}"
echo -e "${YELLOW}=====================================${NC}"
echo ""
echo "# Ver config atual:"
echo "curl -s ${BASE_URL}/api/t/${TOKEN}/config | jq"
echo ""
echo "# Listar sessões:"
echo "curl -s ${BASE_URL}/api/t/${TOKEN}/sessions | jq"
echo ""
echo "# Limpar sessões:"
echo "curl -s -X POST ${BASE_URL}/api/t/${TOKEN}/sessions/clear | jq"
echo ""
echo "# Ver logs do servidor:"
echo "# (No terminal onde o servidor está rodando)"
echo ""

# =====================================================
# 8. VERIFICAÇÃO FINAL
# =====================================================
echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}✅ TESTES PREPARADOS${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo "Sistema pronto para testar o novo motor!"
echo ""
echo "Logs esperados no servidor:"
echo "  [FLOW] Executando ação: GOTO"
echo "  [FLOW] GOTO: OPCOES stack= INICIO"
echo "  [FLOW] Executando ação: BACK"
echo "  [FLOW] BACK para: INICIO stack="
echo "  [FLOW] Executando ação: REPLY"
echo "  [FLOW] Executando ação: END"
echo ""
echo -e "${BLUE}📖 Documentação: MENU_ENGINE_CONFIG.md${NC}"
echo ""
