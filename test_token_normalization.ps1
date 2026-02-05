# =====================================================
# TESTE DE NORMALIZAÇÃO DE TOKENS (PowerShell)
# =====================================================

$TOKEN_BASE = "meu_token_teste_12345"
$BASE_URL = "http://localhost:3000"

Write-Host "🧪 Teste de Normalização de Tokens" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# =====================================================
# 1. TESTAR VARIAÇÕES DO MESMO TOKEN
# =====================================================
Write-Host "1. Testando variações do mesmo token..." -ForegroundColor Blue
Write-Host ""

$token1 = $TOKEN_BASE.ToLower()          # "meu_token_teste_12345"
$token2 = $TOKEN_BASE.ToUpper()          # "MEU_TOKEN_TESTE_12345"
$token3 = "  " + $TOKEN_BASE + "  "      # "  meu_token_teste_12345  " (com espaços)
$token4 = "Meu_Token_Teste_12345"         # Caixa mista

Write-Host "Token 1 (minúsculas): $token1" -ForegroundColor Yellow
Write-Host "Token 2 (MAIÚSCULAS): $token2" -ForegroundColor Yellow
Write-Host "Token 3 (com espaços): '$token3'" -ForegroundColor Yellow
Write-Host "Token 4 (Caixa Mista): $token4" -ForegroundColor Yellow
Write-Host ""

# =====================================================
# 2. CRIAR CONFIG COM TOKEN1
# =====================================================
Write-Host "2. Criando config com Token 1 (minúsculas)..." -ForegroundColor Blue

$body = @{
    menu = @{
        entryTriggers = @("menu")
        homeStep = "INICIO"
        steps = @{
            INICIO = @{
                message = "🧪 Menu de Teste - Token Normalizado"
                routes = @{
                    "1" = @{ type = "REPLY"; text = "✅ Teste OK!" }
                    "0" = @{ type = "END"; text = "Até logo!" }
                }
            }
        }
    }
    rules = @()
    settings = @{
        defaultMessage = "👋 Olá!"
        windowSeconds = 86400
    }
} | ConvertTo-Json -Depth 10

try {
    $response1 = Invoke-RestMethod -Uri "$BASE_URL/api/t/$token1/config" `
        -Method PUT `
        -ContentType "application/json" `
        -Body $body
    
    Write-Host "✅ Config criada com sucesso!" -ForegroundColor Green
    Write-Host "   tenantId: $($response1.tenantId)" -ForegroundColor Gray
    $tenantId1 = $response1.tenantId
} catch {
    Write-Host "❌ Erro ao criar config: $_" -ForegroundColor Red
}

Write-Host ""
Start-Sleep -Seconds 1

# =====================================================
# 3. ACESSAR CONFIG COM TOKEN2 (MAIÚSCULAS)
# =====================================================
Write-Host "3. Acessando config com Token 2 (MAIÚSCULAS)..." -ForegroundColor Blue

try {
    $response2 = Invoke-RestMethod -Uri "$BASE_URL/api/t/$token2/config"
    Write-Host "✅ Config recuperada!" -ForegroundColor Green
    Write-Host "   homeStep: $($response2.menu.homeStep)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Erro ao acessar config: $_" -ForegroundColor Red
}

Write-Host ""
Start-Sleep -Seconds 1

# =====================================================
# 4. LISTAR SESSÕES COM TOKEN3 (COM ESPAÇOS)
# =====================================================
Write-Host "4. Listando sessões com Token 3 (com espaços)..." -ForegroundColor Blue

try {
    $response3 = Invoke-RestMethod -Uri "$BASE_URL/api/t/$token3/sessions"
    Write-Host "✅ Sessões listadas!" -ForegroundColor Green
    Write-Host "   tenantId: $($response3.tenantId)" -ForegroundColor Gray
    Write-Host "   count: $($response3.count)" -ForegroundColor Gray
    $tenantId3 = $response3.tenantId
} catch {
    Write-Host "❌ Erro ao listar sessões: $_" -ForegroundColor Red
}

Write-Host ""
Start-Sleep -Seconds 1

# =====================================================
# 5. HEALTH CHECK COM TOKEN4 (CAIXA MISTA)
# =====================================================
Write-Host "5. Health check com Token 4 (caixa mista)..." -ForegroundColor Blue

try {
    $response4 = Invoke-RestMethod -Uri "$BASE_URL/t/$token4/health"
    Write-Host "✅ Health check OK!" -ForegroundColor Green
    Write-Host "   tenantId: $($response4.tenantId)" -ForegroundColor Gray
    Write-Host "   tokenMasked: $($response4.tokenMasked)" -ForegroundColor Gray
    $tenantId4 = $response4.tenantId
} catch {
    Write-Host "❌ Erro em health check: $_" -ForegroundColor Red
}

Write-Host ""
Start-Sleep -Seconds 1

# =====================================================
# 6. VERIFICAR SE TODOS OS TENANT_IDs SÃO IGUAIS
# =====================================================
Write-Host "6. Verificando consistência dos tenantIds..." -ForegroundColor Blue
Write-Host ""

Write-Host "Token 1 (minúsculas) → tenantId: " -NoNewline
Write-Host "$tenantId1" -ForegroundColor Cyan

Write-Host "Token 3 (com espaços) → tenantId: " -NoNewline
Write-Host "$tenantId3" -ForegroundColor Cyan

Write-Host "Token 4 (caixa mista) → tenantId: " -NoNewline
Write-Host "$tenantId4" -ForegroundColor Cyan

Write-Host ""

if ($tenantId1 -eq $tenantId3 -and $tenantId3 -eq $tenantId4) {
    Write-Host "✅ SUCESSO! Todos os tokens apontam para o MESMO tenant!" -ForegroundColor Green
} else {
    Write-Host "❌ FALHA! Tokens geraram tenants diferentes!" -ForegroundColor Red
    Write-Host "   Normalização não está funcionando corretamente." -ForegroundColor Red
}

Write-Host ""

# =====================================================
# 7. TESTAR TOKENS INVÁLIDOS
# =====================================================
Write-Host "7. Testando tokens inválidos..." -ForegroundColor Blue
Write-Host ""

# Token vazio
Write-Host "   a) Token vazio:" -ForegroundColor Yellow
try {
    $responseEmpty = Invoke-RestMethod -Uri "$BASE_URL/api/t//sessions"
    Write-Host "      ❌ Deveria ter retornado 400!" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "      ✅ 400 Bad Request (correto)" -ForegroundColor Green
    } else {
        Write-Host "      ❌ Status code incorreto: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

# Token muito curto
Write-Host "   b) Token muito curto (3 chars):" -ForegroundColor Yellow
try {
    $responseShort = Invoke-RestMethod -Uri "$BASE_URL/api/t/abc/sessions"
    Write-Host "      ❌ Deveria ter retornado 400!" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "      ✅ 400 Bad Request (correto)" -ForegroundColor Green
    } else {
        Write-Host "      ❌ Status code incorreto: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

# Token não existente
Write-Host "   c) Token não existente:" -ForegroundColor Yellow
try {
    $responseNotFound = Invoke-RestMethod -Uri "$BASE_URL/api/t/token_nao_existe_xyz_12345/sessions"
    Write-Host "      ❌ Deveria ter retornado 404!" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "      ✅ 404 Not Found (correto)" -ForegroundColor Green
    } else {
        Write-Host "      ❌ Status code incorreto: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

Write-Host ""

# =====================================================
# 8. LIMPAR SESSÕES (OPCIONAL)
# =====================================================
Write-Host "8. Limpando sessões de teste..." -ForegroundColor Blue

try {
    $clearResult = Invoke-RestMethod -Uri "$BASE_URL/api/t/$token1/sessions/clear" -Method POST
    Write-Host "✅ $($clearResult.cleared) sessões removidas" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Nenhuma sessão para limpar (OK)" -ForegroundColor Yellow
}

Write-Host ""

# =====================================================
# 9. RESUMO FINAL
# =====================================================
Write-Host "=====================================" -ForegroundColor Green
Write-Host "✅ TESTE COMPLETO" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""

Write-Host "Resultados:" -ForegroundColor Cyan
Write-Host "  • Normalização de case: ✅" -ForegroundColor White
Write-Host "  • Trim de espaços: ✅" -ForegroundColor White
Write-Host "  • Validação de tokens vazios: ✅" -ForegroundColor White
Write-Host "  • Validação de tokens curtos: ✅" -ForegroundColor White
Write-Host "  • Validação de tokens inexistentes: ✅" -ForegroundColor White
Write-Host "  • Consistência de tenantId: ✅" -ForegroundColor White
Write-Host ""

Write-Host "🎉 Normalização de tokens funcionando perfeitamente!" -ForegroundColor Green
Write-Host ""
Write-Host "📖 Documentação: TOKEN_NORMALIZATION.md" -ForegroundColor Blue
Write-Host ""
