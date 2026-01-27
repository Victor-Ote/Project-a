# WhatsApp Bot com Web UI

Bot de WhatsApp com interface web para gerenciar regras dinâmicas de resposta automática e mensagens padrão configuráveis.

## 🚀 Instalação e Execução

### Requisitos
- Node.js 14+
- npm

### Instalar
```bash
npm install
```

### Rodar
```bash
npm start
```

O servidor iniciará em `http://localhost:3000`

## 🎯 Uso

### QR Code
Na primeira execução, acesse `http://localhost:3000` para escanear o QR code e autenticar com WhatsApp.

### Gerenciar Regras
1. Acesse `http://localhost:3000/messages`
2. Configure:
   - **Regras específicas**: Mensagens recebidas → respostas automáticas
   - **Mensagem padrão**: Resposta quando nenhuma regra combina
   - **Janela de tempo**: Intervalo mínimo entre respostas padrão (em minutos)

### Tipos de Matching
- **Exato**: Combina exatamente (case-insensitive)
- **Contains**: Combina se contiver a palavra/frase
- **Regex**: Expressão regular para matches avançados

## 🧪 Testar Mensagem Padrão

A variável de ambiente `DEFAULT_WINDOW_SECONDS` permite configurar a janela de tempo em segundos:

```bash
# Testar com janela de 60 segundos
DEFAULT_WINDOW_SECONDS=60 npm start

# Padrão: 86400 segundos (24 horas)
npm start
```

## 📁 Estrutura

```
.
├── server.js              # Servidor Express + WhatsApp
├── package.json           # Dependências
├── src/
│   ├── bot/               # Lógica do bot
│   ├── rules/             # Motor de regras
│   ├── settings/          # Configurações
│   └── state/             # Rastreamento de contatos
├── web/                   # Interface web (HTML/CSS/JS)
└── data/                  # Dados gerados em runtime (auto-criado)
    ├── settings.json      # Configurações salvas
    ├── rules.json         # Regras dinâmicas
    └── contact_state.json # Estado de contatos
```

## 📝 Configuração Inicial

Na primeira execução, `npm start` criará automaticamente os arquivos em `/data/`:
- `settings.json` - Mensagem padrão e janela de tempo
- `rules.json` - Regras de resposta automática
- `contact_state.json` - Rastreamento de última interação

## 🔧 Desenvolvimento

Editar `server.js` para modificar comportamentos. O servidor não reinicia automaticamente - interrompa (Ctrl+C) e execute `npm start` novamente.

## 📊 Fluxo de Mensagens

1. Mensagem recebida
2. ✅ Tenta combinar com regra específica → Envia resposta
3. ❌ Sem regra → Verifica janela de tempo
4. ✅ Dentro da janela → Silêncio
5. ❌ Fora da janela → Envia mensagem padrão (se configurada)
6. ❌ Sem default → Tenta fallback automático (menu/oi/olá/bom dia/boa tarde/boa noite)
7. ❌ Nada combinou → Silêncio

---

**Versão**: 1.0.0  
**Última atualização**: Janeiro 2026
