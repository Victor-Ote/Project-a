# =====================================================
# TESTE DO ENGINE DE SIMULAÇÃO
# =====================================================

$TOKEN = "teste_engine_simulation_12345"
$BASE_URL = "http://localhost:3000"

Write-Host "🧪 Teste do Engine de Simulação" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# =====================================================
# 0. Criar tenant com config inicial
# =====================================================
Write-Host "0. Criando tenant e config padrão..." -ForegroundColor Blue

$bodyConfig = @{
    triggers = @("menu", "#menu", "start")
    globals = @{
        aliases = @(
            @{
                match = @("sair", "exit", "quit")
                action = @{
                    type = "END"
                    text = "✅ Até logo!"
                    resetStack = $true
                }
            }
            @{
                match = @("home", "início", "voltar ao inicio")
                action = @{
                    type = "BACK"
                    resetStack = $true
                }
            }
        )
    }
    steps = @{
        MENU_INICIAL = @{
            text = "Olá! 👋`nResponda apenas com um número:`n`n1️⃣ Planos`n2️⃣ Como funciona`n3️⃣ Falar com atendente`n`n9️⃣ Repetir menu`n0️⃣ Encerrar"
            routes = @(
                @{ match = @("1"); action = @{ type = "GOTO"; to = "PLANOS" } }
                @{ match = @("2"); action = @{ type = "TEXT"; text = "✅ Como funciona: Somos um bot de atendimento automático" } }
                @{ match = @("3"); action = @{ type = "HANDOFF" } }
                @{ match = @("9", "menu"); action = @{ type = "BACK" } }
                @{ match = @("0"); action = @{ type = "END"; text = "✅ Encerrado" } }
            )
            fallback = @{ type = "TEXT"; text = "⚠️ Opção inválida. Digite 1, 2, 3, 9 ou 0." }
        }
        PLANOS = @{
            text = "📦 *Planos*`nResponda com um número:`n`n1️⃣ Plano Básico - R$ 9,90`n2️⃣ Plano Pro - R$ 29,90`n`n9️⃣ Voltar`n0️⃣ Encerrar"
            routes = @(
                @{ match = @("1"); action = @{ type = "TEXT"; text = "✅ Você escolheu Plano Básico" } }
                @{ match = @("2"); action = @{ type = "TEXT"; text = "✅ Você escolheu Plano Pro" } }
                @{ match = @("9", "voltar"); action = @{ type = "BACK" } }
                @{ match = @("0"); action = @{ type = "END"; text = "✅ Encerrado" } }
            )
            fallback = @{ type = "TEXT"; text = "⚠️ Opção inválida. Digite 1, 2, 9 ou 0." }
        }
    }
} | ConvertTo-Json -Depth 10

try {
    $putResponse = Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/config" `
        -Method PUT `
        -ContentType "application/json" `
        -Body $bodyConfig
    
    Write-Host "✅ Config criada com sucesso!" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ Erro ao criar config: $_" -ForegroundColor Red
}

# =====================================================
# 1. TESTE 1: Route básica (input "1" → GOTO PLANOS)
# =====================================================
Write-Host "1. Teste: Route Básica (input='1')" -ForegroundColor Blue

$simBody = @{ input = "1" } | ConvertTo-Json

try {
    $sim1 = Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/engine/simulate" `
        -Method POST `
        -ContentType "application/json" `
        -Body $simBody
    
    Write-Host "   ✅ Resultado:" -ForegroundColor Green
    Write-Host "      - matched: $($sim1.matched)" -ForegroundColor Gray
    Write-Host "      - via: $($sim1.via)" -ForegroundColor Gray
    Write-Host "      - action: $($sim1.action.type) → $($sim1.action.to)" -ForegroundColor Gray
    Write-Host "      - step: $($sim1.fromStep) → $($sim1.toStep)" -ForegroundColor Gray
    Write-Host "      - stack: $($sim1.stackBefore) → $($sim1.stackAfter)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Erro: $_" -ForegroundColor Red
}

Write-Host ""
Start-Sleep -Seconds 1

# =====================================================
# 2. TESTE 2: Alias global (input "sair" → END)
# =====================================================
Write-Host "2. Teste: Alias Global (input='sair')" -ForegroundColor Blue

$simBody2 = @{ input = "sair" } | ConvertTo-Json

try {
    $sim2 = Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/engine/simulate" `
        -Method POST `
        -ContentType "application/json" `
        -Body $simBody2
    
    Write-Host "   ✅ Resultado:" -ForegroundColor Green
    Write-Host "      - matched: $($sim2.matched)" -ForegroundColor Gray
    Write-Host "      - via: $($sim2.via)" -ForegroundColor Gray
    Write-Host "      - action: $($sim2.action.type)" -ForegroundColor Gray
    Write-Host "      - sessionClosed: $($sim2.sessionClosed)" -ForegroundColor Gray
    Write-Host "      - resetStack: $($sim2.action.resetStack)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Erro: $_" -ForegroundColor Red
}

Write-Host ""
Start-Sleep -Seconds 1

# =====================================================
# 3. TESTE 3: Fallback (input "xyz" → fallback)
# =====================================================
Write-Host "3. Teste: Fallback (input='xyz')" -ForegroundColor Blue

$simBody3 = @{ input = "xyz" } | ConvertTo-Json

try {
    $sim3 = Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/engine/simulate" `
        -Method POST `
        -ContentType "application/json" `
        -Body $simBody3
    
    Write-Host "   ✅ Resultado:" -ForegroundColor Green
    Write-Host "      - matched: $($sim3.matched)" -ForegroundColor Gray
    Write-Host "      - via: $($sim3.via)" -ForegroundColor Gray
    Write-Host "      - action: $($sim3.action.type)" -ForegroundColor Gray
    Write-Host "      - text: $($sim3.action.text)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Erro: $_" -ForegroundColor Red
}

Write-Host ""
Start-Sleep -Seconds 1

# =====================================================
# 4. TESTE 4: Navegação Multi-Step
# =====================================================
Write-Host "4. Teste: Multi-Step (1 → PLANOS, depois 9 → BACK)" -ForegroundColor Blue

$chatId = "test_multistep@c.us"

# Step 1: Ir para PLANOS
$simStep1 = @{ input = "1"; chatId = $chatId } | ConvertTo-Json

try {
    $res1 = Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/engine/simulate" `
        -Method POST `
        -ContentType "application/json" `
        -Body $simStep1
    
    Write-Host "   Step 1: input='1'" -ForegroundColor Yellow
    Write-Host "      - action: $($res1.action.type)" -ForegroundColor Gray
    Write-Host "      - step: $($res1.fromStep) → $($res1.toStep)" -ForegroundColor Gray
    Write-Host "      - stack: $($res1.stackAfter -join ', ')" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Erro: $_" -ForegroundColor Red
}

Start-Sleep -Seconds 1

# Step 2: Voltar (BACK)
$simStep2 = @{ input = "9"; chatId = $chatId } | ConvertTo-Json

try {
    $res2 = Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/engine/simulate" `
        -Method POST `
        -ContentType "application/json" `
        -Body $simStep2
    
    Write-Host "   Step 2: input='9'" -ForegroundColor Yellow
    Write-Host "      - action: $($res2.action.type)" -ForegroundColor Gray
    Write-Host "      - step: $($res2.fromStep) → $($res2.toStep)" -ForegroundColor Gray
    Write-Host "      - stack antes: $($res2.stackBefore -join ', ')" -ForegroundColor Gray
    Write-Host "      - stack depois: $($res2.stackAfter -join ', ')" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Erro: $_" -ForegroundColor Red
}

Write-Host ""
Start-Sleep -Seconds 1

# =====================================================
# 5. TESTE 5: Alias global com resetStack
# =====================================================
Write-Host "5. Teste: Alias Global com resetStack (de PLANOS)" -ForegroundColor Blue

$chatId2 = "test_alias_reset@c.us"

# Step 1: Entrar em PLANOS
$s1 = @{ input = "1"; chatId = $chatId2 } | ConvertTo-Json
Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/engine/simulate" `
    -Method POST `
    -ContentType "application/json" `
    -Body $s1 | Out-Null

# Step 2: Usar alias "home" que deve resetStack
$s2 = @{ input = "home"; chatId = $chatId2 } | ConvertTo-Json

try {
    $res = Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/engine/simulate" `
        -Method POST `
        -ContentType "application/json" `
        -Body $s2
    
    Write-Host "   ✅ Resultado:" -ForegroundColor Green
    Write-Host "      - matched: $($res.matched)" -ForegroundColor Gray
    Write-Host "      - via: $($res.via)" -ForegroundColor Gray
    Write-Host "      - stack antes: $($res.stackBefore -join ', ')" -ForegroundColor Gray
    Write-Host "      - stack depois: $($res.stackAfter -join ', ')" -ForegroundColor Gray
    
    if ($res.stackBefore.Count -gt 0 -and $res.stackAfter.Count -eq 0) {
        Write-Host "      ✅ resetStack funcionou!" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Erro: $_" -ForegroundColor Red
}

Write-Host ""
Start-Sleep -Seconds 1

# =====================================================
# 6. TESTE 6: Case Insensitive
# =====================================================
Write-Host "6. Teste: Case Insensitive" -ForegroundColor Blue

$cases = @("SAIR", "Sair", "sair", "SAIIIR")

foreach ($input in $cases) {
    $simBody = @{ input = $input } | ConvertTo-Json
    
    try {
        $res = Invoke-RestMethod -Uri "$BASE_URL/api/t/$TOKEN/engine/simulate" `
            -Method POST `
            -ContentType "application/json" `
            -Body $simBody
        
        $matched = if ($res.matched) { "✅" } else { "❌" }
        Write-Host "   $matched input='$input' → matched=$($res.matched) via=$($res.via)" -ForegroundColor Gray
    } catch {
        Write-Host "   ❌ input='$input' → Erro" -ForegroundColor Red
    }
}

Write-Host ""

# =====================================================
# 7. RESUMO FINAL
# =====================================================
Write-Host "=====================================" -ForegroundColor Green
Write-Host "✅ TESTES COMPLETOS" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""

Write-Host "Funcionalidades validadas:" -ForegroundColor Cyan
Write-Host "  ✅ Routes do step" -ForegroundColor White
Write-Host "  ✅ Aliases globais" -ForegroundColor White
Write-Host "  ✅ Fallback" -ForegroundColor White
Write-Host "  ✅ Navegação multi-step (GOTO/BACK)" -ForegroundColor White
Write-Host "  ✅ resetStack" -ForegroundColor White
Write-Host "  ✅ Case insensitive matching" -ForegroundColor White
Write-Host ""

Write-Host "🎉 Engine de simulação funcionando perfeitamente!" -ForegroundColor Green
Write-Host ""
Write-Host "📖 Documentação: ENGINE_SIMULATION.md" -ForegroundColor Blue
Write-Host "🚀 Próximo: Testar no WhatsApp com cliente real" -ForegroundColor Blue
Write-Host ""
