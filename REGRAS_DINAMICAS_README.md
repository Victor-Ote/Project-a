# 🤖 WhatsApp Bot - Regras Dinâmicas (Implementação Completa)

## 📋 Arquivos Criados/Modificados

### Arquivos Novos
```
src/rules/rulesStore.js          ← Módulo de cache e normalização
server.js                        ← Atualizado com matching de regras
test-rules.js                    ← Testes de validação
```

### Arquivos Existentes (Modificados)
```
package.json                     ← Já contém express, socket.io, qrcode
```

---

## 🎯 Funcionalidades Implementadas

### 1️⃣ **Matching de Regras - 3 Tipos**

#### Tipo 1: **Exact Match** (Padrão)
```json
{
  "received": "oi",
  "sent": "Olá! Como posso ajudá-lo?"
}
```
- Normaliza: `trim` + `lowercase` + `sem acentos` + `collapse espaços`
- Exemplo: `"OI"`, `"  Oi  "`, `"ÓI"` → todos batem

#### Tipo 2: **Contains**
```json
{
  "received": "contains: orçamento",
  "sent": "Vou encaminhar seu pedido de orçamento"
}
```
- Procura por substring na mensagem normalizada
- Exemplo: `"Gostaria de um orçamento"` → bate

#### Tipo 3: **Regex**
```json
{
  "received": "regex: ^pedido\\s*#\\d+",
  "sent": "Seu pedido foi registrado!"
}
```
- Usa regex contra mensagem ORIGINAL (sem normalização)
- Exemplo: `"pedido #123"`, `"Pedido #456"` → batem

---

## 🔄 Hot Reload (Sem Restartar Servidor)

**Implementação:** `src/rules/rulesStore.js`

```javascript
// Cache com verificação de mtime
let cachedRules = [];
let lastMtime = null;

function getRulesSync() {
  // Se arquivo não mudou, retorna cache (rápido)
  // Se arquivo mudou, recarrega e atualiza cache
}
```

**Fluxo:**
1. Web UI: Salva novas regras em `data/rules.json`
2. Próxima mensagem no WhatsApp
3. `getRulesSync()` detecta mudança do arquivo
4. Recarrega e aplica novas regras

---

## 🛡️ Duplicate Prevention

**Implementação:** `server.js`

```javascript
const processedMessages = new Set();
const DUPLICATE_TIMEOUT = 10 * 60 * 1000; // 10 minutos

function addProcessedMessage(msgId) {
  processedMessages.add(msgId);
  setTimeout(() => {
    processedMessages.delete(msgId);
  }, DUPLICATE_TIMEOUT);
}
```

**Benefício:** Impede que a mesma mensagem seja processada 2x em 10 minutos

---

## 📊 Normalização de Strings

**Função:** `normalizeString(str)`

```javascript
"OLÁ"       → "ola"
"  Oi  "    → "oi"
"Ção"       → "cao"
"São José"  → "sao jose"
```

Faz: `trim` → `toLowerCase` → `remove diacríticos` → `collapse espaços`

---

## 🔀 Fluxo de Processamento de Mensagem

```
[Mensagem Privada Recebida]
        ↓
[Verificar se é grupo? → SIM = ignorar]
        ↓
[Já foi processada? → SIM = ignorar]
        ↓
[Procurar regra correspondente]
        ├─ regex: (contra original)
        ├─ contains: (contra normalizado)
        └─ exact (default)
        ↓
    [ENCONTROU?]
    ├─ SIM → Enviar resposta da regra
    │        (com typing simulation)
    │
    └─ NÃO → Testar fallback
             (oi/menu/bom dia/etc)
             Se sim → Enviar saudação padrão
             Se não → (silencioso)
```

---

## 📝 Exemplo Prático

### Arquivo: `data/rules.json`
```json
[
  {
    "received": "oi",
    "sent": "Olá! Como posso ajudá-lo? 👋"
  },
  {
    "received": "contains: orçamento",
    "sent": "Ótimo! Qual é seu email?"
  },
  {
    "received": "regex: ^pedido\\s*#\\d+",
    "sent": "Pedido registrado! 📋"
  },
  {
    "received": "menu",
    "sent": "📋 Menu:\n1. Orçamento\n2. Suporte"
  }
]
```

### Usuário Envia WhatsApp
```
Usuário: "Oi"
Bot:    "Olá! Como posso ajudá-lo? 👋"

Usuário: "Preciso de um orçamento"
Bot:    "Ótimo! Qual é seu email?"

Usuário: "pedido #123"
Bot:    "Pedido registrado! 📋"

Usuário: "MENU"
Bot:    "📋 Menu:
         1. Orçamento
         2. Suporte"
```

---

## ✅ Testes Implementados

Execute: `node test-rules.js`

Valida:
- ✅ Normalização de strings
- ✅ Matching exact (case-insensitive)
- ✅ Matching contains (substring search)
- ✅ Matching regex (pattern)
- ✅ Hot reload com mtime checking

**Resultado:** Todos os testes passam ✅

---

## 📚 Logs de Debug

Quando um botão disparar:

```
✅ Regra correspondida [exact]: "oi"
✅ Regra correspondida [contains]: "contains: orçamento"
✅ Regra correspondida [regex]: "regex: ^pedido\\s*#\\d+"
✅ Regras recarregadas: 4 regra(s)
⏭️  Mensagem já processada (duplicate): msg_id_...
📨 Usando resposta da regra: "Sua resposta aqui"
```

---

## 🚀 Como Usar

### 1. Iniciar Servidor
```bash
npm start
# Servidor rodando em http://localhost:3000
```

### 2. Acessar Interface Web
- **QR Code:** http://localhost:3000
- **Gerenciar Regras:** http://localhost:3000/messages

### 3. Adicionar/Editar Regras
1. Clique em "Gerenciar Mensagens"
2. Clique "Adicionar" para novo campo
3. Preencha `Mensagem recebida` e `Mensagem enviada`
4. Clique "Salvar"
5. ✅ Regra ativa imediatamente!

### 4. Teste no WhatsApp
- Envie mensagens para o bot
- Bot responde com base nas regras

---

## 🔧 Tratamento de Erros

| Situação | Comportamento |
|----------|---------------|
| `rules.json` ausente | Retorna `[]` (sem crash) |
| `rules.json` inválido | Log warning + usa cache anterior |
| Regex inválida | Log warning + continua tentando outras |
| Grupo recebido | Ignorado silenciosamente |
| Conexão perdida | Fallback para boas-vindas |
| Mensagem duplicada | Ignorada dentro de 10 minutos |

---

## 📦 Dependências

Já instaladas via `npm install`:
```json
{
  "express": "^4.18.2",
  "socket.io": "^4.5.4",
  "qrcode": "^1.5.3",
  "whatsapp-web.js": "^1.34.4"
}
```

---

## 🎓 Estrutura Técnica

### `src/rules/rulesStore.js`
- **Responsabilidade:** Cache + Matching
- **Funções principais:**
  - `getRulesSync()` - Carrega com cache
  - `normalizeString()` - Normaliza texto
  - `findMatchingRule()` - Encontra regra

### `server.js`
- **Responsabilidade:** Express + WebSocket + WhatsApp
- **Mudanças:**
  - Import `findMatchingRule` do rulesStore
  - Adicionado Set `processedMessages`
  - Message handler agora tenta rules antes de fallback

### `web/` (Sem mudanças)
- Salva regras via `POST /api/rules`
- Carrega regras via `GET /api/rules`

---

## 💡 Destaques da Implementação

✨ **Hot Reload Inteligente**
- Sem restartar servidor
- Cache com mtime checking
- Validação segura de JSON

✨ **Matching Flexível**
- 3 tipos: exact, contains, regex
- Normalização robusta (acentos, espaços)
- Suporte a patterns complexos

✨ **Robust Error Handling**
- Não trava com arquivo inválido
- Logs informativos
- Fallback automático

✨ **Performance**
- Cache em memória
- mtime checking (não relê se não mudou)
- Set para duplicate prevention

---

## 📞 Suporte

**Para adicionar novas funcionalidades:**
1. Edite `data/rules.json` com nova regra
2. Salve via web UI ou arquivo direto
3. Pronto! Bot usa nova regra na próxima mensagem

**Para debug:**
- Verifique `data/rules.json`
- Execute `node test-rules.js`
- Verifique logs do servidor (npm start)

---

**Implementação Completa ✅**
