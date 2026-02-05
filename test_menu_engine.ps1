# =====================================================
# TESTE DO MOTOR DE FLUXO CONFIGURÁVEL (PowerShell)
# =====================================================

$TOKEN = "seu_token_aqui"
$BASE_URL = "http://localhost:3000"

Write-Host "🧪 Testando Motor de Fluxo Configurável" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# =====================================================
# 1. ATUALIZAR CONFIG COM NOVO FORMATO
# =====================================================
Write-Host "1. Atualizando config com novo formato de menu..." -ForegroundColor Blue

$body = @{
    menu = @{
        entryTriggers = @("menu", "start", "#menu")
        homeStep = "INICIO"
        steps = @{
            INICIO = @{
                message = "🤖 Menu de Teste`n`n1️⃣ Ir para Opções`n2️⃣ Resposta Rápida`n9️⃣ Repetir`n0️⃣ Sair"
                routes = @{
                    "1" = @{ type = "GOTO"; to = "OPCOES" }
                    "2" = @{ type = "REPLY"; text = "✅ Esta é uma resposta rápida!" }
                    "9" = @{ type = "HOME" }
                    "0" = @{ type = "END"; text = "👋 Até logo!" }
                    "menu" = @{ type = "HOME" }
                }
            }
            OPCOES = @{
                message = "📋 Opções`n`n1️⃣ Opção A`n2️⃣ Opção B`n9️⃣ Voltar`n0️⃣ Menu Principal"
                routes = @{
                    "1" = @{ type = "REPLY"; text = "✅ Você escolheu A" }
                    "2" = @{ type = "REPLY"; text = "✅ Você escolheu B" }
                    "9" = @{ type = "BACK" }
                    "0" = @{ type = "HOME" }
                    "voltar" = @{ type = "BACK" }
                    "menu" = @{ type = "HOME" }
                }
            }
        }
    }
    rules = @()
    settings = @{
        defaultMessage = "👋 Olá! Digite menu para começar."
        windowSeconds = 86400
    }
} | ConvertTo-Json -Depth 10

$response = Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/config" `
    -Method PUT `
    -ContentType "application/json" `
    -Body $body

Write-Host ""
Write-Host "✅ Config atualizada!" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 2

# =====================================================
# 2. VERIFICAR CONFIG SALVA
# =====================================================
Write-Host "2. Verificando config salva no banco..." -ForegroundColor Blue

$config = Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/config"
$config | ConvertTo-Json -Depth 10

Write-Host ""
Write-Host "✅ Config recuperada do DB" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 2

# =====================================================
# 3. LISTAR SESSÕES ATIVAS
# =====================================================
Write-Host "3. Listando sessões ativas..." -ForegroundColor Blue

$sessions = Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/sessions"
$sessions | ConvertTo-Json -Depth 10

$count = $sessions.count
Write-Host ""
Write-Host "📊 Sessões ativas: $count" -ForegroundColor Yellow
Write-Host ""
Start-Sleep -Seconds 2

# =====================================================
# 4. LIMPAR SESSÕES (SE NECESSÁRIO)
# =====================================================
if ($count -gt 0) {
    Write-Host "4. Limpando sessões existentes..." -ForegroundColor Blue
    
    $clearResult = Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/sessions/clear" -Method POST
    $clearResult | ConvertTo-Json
    
    $cleared = $clearResult.cleared
    Write-Host ""
    Write-Host "✅ $cleared sessões removidas" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "4. Nenhuma sessão ativa para limpar" -ForegroundColor Blue
    Write-Host ""
}

Start-Sleep -Seconds 2

# =====================================================
# 5. INSTRUÇÕES DE TESTE MANUAL
# =====================================================
Write-Host ""
Write-Host "=====================================" -ForegroundColor Yellow
Write-Host "🧪 TESTE MANUAL NO WHATSAPP" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Agora teste no WhatsApp conectado:"
Write-Host ""
Write-Host "1️⃣  Digite: " -NoNewline; Write-Host "menu" -ForegroundColor Green
Write-Host "   → Deve mostrar: Menu de Teste com 4 opções"
Write-Host ""
Write-Host "2️⃣  Digite: " -NoNewline; Write-Host "1" -ForegroundColor Green
Write-Host "   → Deve ir para: Opções (GOTO)"
Write-Host "   → Stack deve ter: [INICIO]"
Write-Host ""
Write-Host "3️⃣  Digite: " -NoNewline; Write-Host "1" -ForegroundColor Green
Write-Host "   → Deve responder: ✅ Você escolheu A (REPLY)"
Write-Host "   → Step mantém: OPCOES"
Write-Host ""
Write-Host "4️⃣  Digite: " -NoNewline; Write-Host "9" -ForegroundColor Green
Write-Host "   → Deve voltar para: INICIO (BACK)"
Write-Host "   → Stack deve estar vazio"
Write-Host ""
Write-Host "5️⃣  Digite: " -NoNewline; Write-Host "2" -ForegroundColor Green
Write-Host "   → Deve responder: ✅ Esta é uma resposta rápida! (REPLY)"
Write-Host "   → Step mantém: INICIO"
Write-Host ""
Write-Host "6️⃣  Digite: " -NoNewline; Write-Host "0" -ForegroundColor Green
Write-Host "   → Deve responder: 👋 Até logo! (END)"
Write-Host "   → Sessão deve ser removida"
Write-Host ""
Write-Host "7️⃣  Verifique sessões novamente:"
Write-Host "   Invoke-RestMethod -Uri $BASE_URL/api/t/$TOKEN/sessions | ConvertTo-Json"
Write-Host ""

# =====================================================
# 6. EXEMPLO DE MENU COMPLETO
# =====================================================
Write-Host ""
Write-Host "=====================================" -ForegroundColor Yellow
Write-Host "📦 EXEMPLO DE MENU COMPLETO" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Para menu mais completo, carregue o arquivo JSON:"
Write-Host ""
Write-Host "`$menuJson = Get-Content menu_example_new_format.json | ConvertFrom-Json" -ForegroundColor Blue
Write-Host "Invoke-RestMethod -Uri $BASE_URL/api/t/$TOKEN/config ``" -ForegroundColor Blue
Write-Host "  -Method PUT ``" -ForegroundColor Blue
Write-Host "  -ContentType 'application/json' ``" -ForegroundColor Blue
Write-Host "  -Body (`$menuJson | ConvertTo-Json -Depth 10)" -ForegroundColor Blue
Write-Host ""
Write-Host "Arquivo: menu_example_new_format.json"
Write-Host ""

# =====================================================
# 7. COMANDOS ÚTEIS
# =====================================================
Write-Host ""
Write-Host "=====================================" -ForegroundColor Yellow
Write-Host "🛠️  COMANDOS ÚTEIS" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "# Ver config atual:"
Write-Host "Invoke-RestMethod -Uri $BASE_URL/api/t/$TOKEN/config | ConvertTo-Json -Depth 10"
Write-Host ""
Write-Host "# Listar sessões:"
Write-Host "Invoke-RestMethod -Uri $BASE_URL/api/t/$TOKEN/sessions | ConvertTo-Json"
Write-Host ""
Write-Host "# Limpar sessões:"
Write-Host "Invoke-RestMethod -Uri $BASE_URL/api/t/$TOKEN/sessions/clear -Method POST | ConvertTo-Json"
Write-Host ""
Write-Host "# Ver logs do servidor:"
Write-Host "# (No terminal onde o servidor está rodando)"
Write-Host ""

# =====================================================
# 8. VERIFICAÇÃO FINAL
# =====================================================
Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "✅ TESTES PREPARADOS" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Sistema pronto para testar o novo motor!"
Write-Host ""
Write-Host "Logs esperados no servidor:"
Write-Host "  [FLOW] Executando ação: GOTO"
Write-Host "  [FLOW] GOTO: OPCOES stack= INICIO"
Write-Host "  [FLOW] Executando ação: BACK"
Write-Host "  [FLOW] BACK para: INICIO stack="
Write-Host "  [FLOW] Executando ação: REPLY"
Write-Host "  [FLOW] Executando ação: END"
Write-Host ""
Write-Host "📖 Documentação: MENU_ENGINE_CONFIG.md" -ForegroundColor Blue
Write-Host ""
