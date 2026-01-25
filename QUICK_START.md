# 🚀 QUICK START - Regras Dinâmicas

## 1️⃣ Iniciar o Bot

```bash
npm start
```

Saída esperada:
```
🚀 Servidor rodando em http://localhost:3000
🔐 Autenticado
✅ Tudo certo! WhatsApp conectado.
```

## 2️⃣ Acessar a Web UI

- **QR Code:** http://localhost:3000
- **Gerenciar Regras:** http://localhost:3000/messages

## 3️⃣ Adicionar Primeira Regra

1. Clique em "Gerenciar Mensagens"
2. Clique em "Adicionar"
3. Preencha:
   - **Mensagem recebida:** `oi`
   - **Mensagem enviada:** `Olá! Bem-vindo ao bot!`
4. Clique em "Salvar"
5. ✅ Pronto! Regra ativa imediatamente

## 4️⃣ Testar no WhatsApp

Envie para o bot: **`oi`**

Bot responde: **`Olá! Bem-vindo ao bot!`**

## 📝 Exemplos de Regras

### Exemplo 1: Match Exato (Default)
```
Mensagem recebida: menu
Mensagem enviada: 📋 Menu disponível:
1. Orçamento
2. Suporte
3. Contato
```

### Exemplo 2: Match Contains
```
Mensagem recebida: contains: orçamento
Mensagem enviada: Qual é seu email para enviarmos o orçamento?
```

### Exemplo 3: Match Regex
```
Mensagem recebida: regex: ^pedido\s*#\d+
Mensagem enviada: Seu pedido foi registrado! 📋
```

## 🔄 Como Funciona o Hot Reload

1. Edite uma regra na web UI
2. Clique "Salvar"
3. Arquivo `data/rules.json` é atualizado
4. **Próxima mensagem no WhatsApp** usa as novas regras
5. ✅ Sem necessidade de restartar servidor!

## 🛠️ Troubleshooting

### Bot não responde

**Checklist:**
1. ✅ Servidor rodando? (`npm start`)
2. ✅ Regra salva? (verifique em /messages)
3. ✅ Sintaxe correta? (trim espaços)
4. ✅ Arquivo `data/rules.json` existe?

### Erro ao salvar regra

**Solução:** Verifique se ambos os campos têm conteúdo:
- Mensagem recebida: não vazia
- Mensagem enviada: não vazia

### QR code não aparece

1. Feche o bot: `Ctrl+C`
2. Abra http://localhost:3000
3. Escaneie novo QR no WhatsApp

## 📚 Documentação Completa

Ver: `REGRAS_DINAMICAS_README.md`

## ✅ Verificação Rápida

Execute para testar todas as funcionalidades:

```bash
node test-rules.js
```

Saída esperada:
```
✅ Regras recarregadas: 4 regra(s)
✅ Regra correspondida [exact]: "oi"
✅ Regra correspondida [contains]: "contains: orçamento"
✅ Regra correspondida [regex]: "regex: ^pedido\s*#\d+"
```

---

**Pronto para começar!** 🎉
