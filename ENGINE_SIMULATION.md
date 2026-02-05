# 🧪 ENGINE DE MENU CONFIGURÁVEL - GUIA DE TESTES

## 📋 Visão Geral

O engine de menu agora é **100% configurável via JSON**, com suporte a:
- **Aliases globais**: regras que funcionam em qualquer step
- **Routes por step**: regras específicas de cada step
- **Fallback**: mensagem padrão se nenhuma rota bater
- **Endpoint de simulação**: teste sem WhatsApp

---

## 🔧 Schema de Configuração

```json
{
  "triggers": ["menu", "#menu", "start"],
  "globals": {
    "aliases": [
      {
        "match": ["sair", "exit"],
        "action": {
          "type": "END",
          "text": "Até logo!",
          "resetStack": true
        }
      }
    ]
  },
  "steps": {
    "MENU_INICIAL": {
      "text": "Olá! Escolha uma opção",
      "routes": [
        {
          "match": ["1", "um"],
          "action": {
            "type": "GOTO",
            "to": "PLANOS"
          }
        }
      ],
      "fallback": {
        "type": "TEXT",
        "text": "Opção inválida. Tente novamente."
      }
    },
    "PLANOS": {
      "text": "Escolha um plano",
      "routes": [...],
      "fallback": {...}
    }
  }
}
```

---

## 📍 Fluxo de Processamento

Quando uma mensagem é recebida em modo MENU:

```
1. Normalize input (trim + toLowerCase)
   ↓
2. Check globals.aliases
   ├─ Match? → Execute action (com resetStack opcional)
   └─ No match ↓
3. Check steps[currentStep].routes
   ├─ Match? → Execute action
   └─ No match ↓
4. Execute steps[currentStep].fallback (se existir)
   └─ Não? ↓
5. Enviar settings.defaultMessage (último recurso)
```

---

## ⚡ Tipos de Ações (Action Types)

### **TEXT**
Envia mensagem, mantém step atual.

```json
{
  "type": "TEXT",
  "text": "Você escolheu a opção X"
}
```

**Logs**: `[ENGINE] matched via=... action=TEXT`

---

### **GOTO**
Push step atual no stack, navega para novo step.

```json
{
  "type": "GOTO",
  "to": "PLANOS"
}
```

**Fluxo**:
- Stack antes: `["MENU_INICIAL"]`
- Step atual: `"PLANOS"`
- Stack depois: `["MENU_INICIAL"]`

**Logs**: `[ENGINE] matched via=... action=GOTO fromStep=MENU_INICIAL toStep=PLANOS stackLen=1`

---

### **BACK**
Pop stack, volta ao step anterior.

```json
{
  "type": "BACK"
}
```

**Fluxo**:
- Stack: `["MENU_INICIAL"]` → pop → `[]`
- Novo step: `"MENU_INICIAL"`

**Logs**: `[ENGINE] matched via=... action=BACK fromStep=PLANOS toStep=MENU_INICIAL stackLen=0`

---

### **END**
Encerra sessão, mensagem final opcional.

```json
{
  "type": "END",
  "text": "Atendimento encerrado. Até logo!"
}
```

**Resultado**: Sessão deletada, contato volta ao estado inicial.

---

### **HANDOFF**
Transfere para atendente (placeholder).

```json
{
  "type": "HANDOFF"
}
```

**Resultado**: Envia `"Um atendente falará com você"`.

---

## 🔑 Propriedades Especiais

### **resetStack**
Limpa o stack ao executar a ação (útil em aliases globais).

```json
{
  "match": ["home", "início"],
  "action": {
    "type": "BACK",
    "resetStack": true
  }
}
```

Resultado: Volta para MENU_INICIAL sem manter stack.

---

## 🧪 Endpoint de Simulação

**Teste o engine SEM WhatsApp**

### Request

```http
POST /api/t/:token/engine/simulate
Content-Type: application/json

{
  "input": "1",
  "chatId": "debug@c.us",
  "mode": "MENU"
}
```

**Parâmetros**:
- `input` *(required)*: Texto que o usuário digitou
- `chatId` *(optional)*: ID de simulação (padrão: `debug@c.us`)
- `mode` *(optional)*: Modo de operação (padrão: `MENU`)

### Response

```json
{
  "matched": true,
  "via": "alias|route|fallback|default",
  "action": {
    "type": "GOTO",
    "to": "PLANOS",
    "text": null
  },
  "fromStep": "MENU_INICIAL",
  "toStep": "PLANOS",
  "stackBefore": [],
  "stackAfter": ["MENU_INICIAL"],
  "sessionClosed": false
}
```

**Campos**:
- `matched`: boolean - se input casou com alguma rota
- `via`: "alias" | "route" | "fallback" | "default" - qual regra foi usada
- `action`: Action que foi executada
- `fromStep` / `toStep`: Transição entre steps
- `stackBefore` / `stackAfter`: Estado do stack
- `sessionClosed`: Se a sessão foi encerrada

---

## 📝 Exemplos de Teste (Postman)

### **1. Teste Básico - Route no Step Atual**

```bash
curl -X POST http://localhost:3000/api/t/seu_token/engine/simulate \
  -H "Content-Type: application/json" \
  -d '{"input": "1"}'
```

**Resultado esperado**:
```json
{
  "matched": true,
  "via": "route",
  "action": { "type": "GOTO", "to": "PLANOS" },
  "fromStep": "MENU_INICIAL",
  "toStep": "PLANOS",
  "stackBefore": [],
  "stackAfter": ["MENU_INICIAL"]
}
```

---

### **2. Teste Alias Global - "Sair"**

```bash
curl -X POST http://localhost:3000/api/t/seu_token/engine/simulate \
  -H "Content-Type: application/json" \
  -d '{"input": "sair"}'
```

**Resultado esperado**:
```json
{
  "matched": true,
  "via": "alias",
  "action": { "type": "END", "text": "Até logo!", "resetStack": true },
  "fromStep": "MENU_INICIAL",
  "toStep": null,
  "stackBefore": [],
  "stackAfter": [],
  "sessionClosed": true
}
```

---

### **3. Teste Fallback - Input Inválido**

```bash
curl -X POST http://localhost:3000/api/t/seu_token/engine/simulate \
  -H "Content-Type: application/json" \
  -d '{"input": "xyz"}'
```

**Resultado esperado**:
```json
{
  "matched": true,
  "via": "fallback",
  "action": { "type": "TEXT", "text": "⚠️ Opção inválida..." },
  "fromStep": "MENU_INICIAL",
  "toStep": null,
  "stackBefore": [],
  "stackAfter": []
}
```

---

### **4. Teste Navegação Multi-Step**

Sequência: `1` → PLANOS, depois `9` → voltar para MENU_INICIAL

```bash
# Step 1: ir para PLANOS
curl -X POST http://localhost:3000/api/t/seu_token/engine/simulate \
  -H "Content-Type: application/json" \
  -d '{"input": "1", "chatId": "sim001@c.us"}'

# Resposta: stackAfter = ["MENU_INICIAL"]

# Step 2: voltar (BACK)
curl -X POST http://localhost:3000/api/t/seu_token/engine/simulate \
  -H "Content-Type: application/json" \
  -d '{"input": "9", "chatId": "sim001@c.us"}'

# Resposta: stackBefore = ["MENU_INICIAL"], stackAfter = []
```

---

## 📊 Logs do Engine

Acompanhe a execução via console:

```
[ENGINE] matched via=alias action=END fromStep=PLANOS toStep=null stackLen=1
[ENGINE] matched via=route action=GOTO fromStep=MENU_INICIAL toStep=PLANOS stackLen=0
[ENGINE] matched via=fallback action=TEXT fromStep=MENU_INICIAL stackLen=0
[ENGINE] matched via=default fromStep=MENU_INICIAL stackLen=0
```

**Campos**:
- `via`: alias | route | fallback | default
- `action`: tipo da ação (GOTO, BACK, TEXT, END, HANDOFF)
- `fromStep` → `toStep`: transição
- `stackLen`: comprimento do stack APÓS execução

---

## ✅ Validação do Schema

Ao fazer PUT de config, o schema é validado:

```bash
curl -X PUT http://localhost:3000/api/t/seu_token/config \
  -H "Content-Type: application/json" \
  -d '{
    "steps": {
      "MENU_INICIAL": {
        "text": "Menu",
        "routes": [
          {
            "match": ["1"],
            "action": {
              "type": "GOTO",
              "to": "STEP_NAO_EXISTE"
            }
          }
        ]
      }
    }
  }'
```

**Erros possíveis**:
- `"action.to não existe: STEP_NAO_EXISTE"`
- `"menu.steps.MENU_INICIAL.routes deve ser um array"`
- `"action.type inválido"`
- `"route.match deve ser array não vazio"`

---

## 🔄 Fluxo Real no WhatsApp

Após configurar o menu via Postman, teste no WhatsApp:

1. **Enviar**: `menu` → Trigger acionado → Menu enviado
2. **Enviar**: `1` → Route casou → GOTO PLANOS → Próximo step
3. **Enviar**: `9` → Route casou → BACK → Volta ao step anterior
4. **Enviar**: `xyz` → Nenhuma route → Fallback enviado
5. **Enviar**: `sair` → Alias casou → END → Sessão encerrada

---

## 🚀 Workflow Recomendado

1. **Desenhar** o menu em papel / figma (steps, transitions)
2. **Simular** cada cenário via `/engine/simulate`
3. **Validar** os logs `[ENGINE]` no console
4. **Testar** no WhatsApp com cliente real
5. **Iterar** ajustando config via PUT conforme feedback

---

## 📌 Dicas

- Use `resetStack: true` em aliases que devem limpar navegação (home, menu, sair)
- Sempre defina `fallback` em cada step para inputs inesperados
- Mantenha `settings.defaultMessage` como último recurso global
- Normalize inputs: `"SAIR"`, `"Sair"`, `"sair"` → tudo vira `"sair"`
- Stack = historico de navegacao; útil para `BACK` funcionarmelhor

---

## 🐛 Troubleshooting

| Problema | Causa | Solução |
|----------|-------|--------|
| Ação não executa | Input não normalizado corretamente | Verifique se `match` está em minúsculas |
| Stack cresce indefinidamente | Muitos GOTO sem BACK | Adicione BACK nas rotas de volta |
| Fallback não funciona | Fallback não definido no step | Adicione `fallback` field ao step |
| Alias casou mas não funciona | Action inválida ou type errado | Valide `action.type` e campos obrigatórios |

---

## 📖 Referência Rápida

```javascript
// Format da Action
{
  "type": "TEXT|GOTO|BACK|END|HANDOFF",
  "to": "stepId",              // obrigatório se type=GOTO
  "text": "mensagem",           // obrigatório se type=TEXT ou END
  "resetStack": true            // opcional, resetastack ao executar
}

// Format da Route
{
  "match": ["1", "um", "opção 1"],  // array de strings
  "action": { ... }                  // Action acima
}

// Format do Step
{
  "text": "Conteúdo do step",
  "routes": [ { match, action }, ... ],
  "fallback": { ... }           // opcional
}

// Format do Menu
{
  "triggers": ["menu", "#menu"],
  "globals": {
    "aliases": [ { match, action }, ... ]  // opcional
  },
  "steps": {
    "MENU_INICIAL": { ... },
    "PLANOS": { ... }
  }
}
```

---

## 🎯 Próximos Passos

- [ ] Testar engine com múltiplos tenants
- [ ] Adicionar ações customizadas (lambda functions)
- [ ] Implementar persistência de dados na sessão
- [ ] Suporte a variáveis no texto (e.g., `{{nome_usuario}}`)
- [ ] Analytics: rastrear jornada do usuário

