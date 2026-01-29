const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const qrcode = require("qrcode");
const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");
const { findMatchingRule } = require("./src/rules/rulesStore");
const { getSettingsSync, saveSettingsSync } = require("./src/settings/settingsStore");
const { markActivity, markDefaultSent } = require("./src/state/contactStateStore");
const { shouldSendDefault } = require("./src/bot/defaultReply");

// =====================================
// CONFIGURAÇÃO DE PORTAS E DIRETÓRIOS
// =====================================
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(__dirname, "data");
const RULES_FILE = path.resolve(__dirname, "data", "rules.json");

// Criar pasta data se não existir
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// =====================================
// CONFIGURAÇÃO EXPRESS E SOCKET.IO
// =====================================
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "web")));

// =====================================
// VARIÁVEIS GLOBAIS DO BOT
// =====================================
let currentQrDataUrl = null;
let currentStatus = "waiting_qr";

// Set para prevenção de duplicate replies (10 minutos)
const processedMessages = new Set();
const DUPLICATE_TIMEOUT = 10 * 60 * 1000; // 10 minutos

// =====================================
// CONTROLE DE SESSÃO
// =====================================
const sessions = new Map();
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutos
const COMMAND_MENU = "menu";

// Função para limpar mensagens processadas após timeout
function addProcessedMessage(msgId) {
  processedMessages.add(msgId);
  setTimeout(() => {
    processedMessages.delete(msgId);
  }, DUPLICATE_TIMEOUT);
}

function normalizeInput(input) {
  return (input || "").trim();
}

function getMenuInicialText() {
  return "Olá! 👋\nResponda apenas com um número:\n\n1️⃣ Planos\n2️⃣ Como funciona\n3️⃣ Falar com atendente\n\n9️⃣ Repetir menu\n0️⃣ Encerrar";
}

async function sendMenuInicial(chatId) {
  console.log("[FLOW] Enviando MENU_INICIAL:", chatId);
  await client.sendMessage(chatId, getMenuInicialText());
  console.log("[FLOW] MENU_INICIAL enviado:", chatId);
}

function getPlanosText() {
  return "📦 *Planos*\nResponda apenas com um número:\n\n1️⃣ Plano Básico\n2️⃣ Plano Pro\n\n9️⃣ Voltar ao menu\n0️⃣ Encerrar";
}

async function sendPlanos(chatId) {
  console.log("[FLOW] Enviando PLANOS:", chatId);
  await client.sendMessage(chatId, getPlanosText());
  console.log("[FLOW] PLANOS enviado:", chatId);
}

function isNumericOnly(body) {
  return /^[0-9]+$/.test(body);
}

async function handleMenuFlow(chatId, body, session) {
  console.log("[MENU] Entrada recebida:", chatId, "body=", body, "step=", session.step);

  if (session.step === "MENU_INICIAL") {
    // Validar entrada numérica
    if (!isNumericOnly(body)) {
      await client.sendMessage(chatId, "⚠️ Responda apenas com números (1, 2, 3, 9 ou 0).");
      await sendMenuInicial(chatId);
      console.log("[MENU][ERROR] Entrada não numérica no MENU_INICIAL:", chatId, body);
      return;
    }

    // Processar escolhas numéricas
    switch (body) {
      case "1":
        session.step = "PLANOS";
        console.log("[STEP] Alterando step:", chatId, "=>", session.step);
        await sendPlanos(chatId);
        break;

      case "2":
        await client.sendMessage(chatId, "✅ Você escolheu: Como funciona");
        console.log("[MENU] Escolha 2 (Como funciona):", chatId);
        break;

      case "3":
        await client.sendMessage(chatId, "✅ Você escolheu: Falar com atendente");
        console.log("[MENU] Escolha 3 (Atendente):", chatId);
        break;

      case "9":
        await sendMenuInicial(chatId);
        console.log("[MENU] Repetir menu (9):", chatId);
        break;

      case "0":
        await client.sendMessage(chatId, "✅ Atendimento encerrado. Quando quiser, digite 'menu' novamente.");
        console.log("[MENU] Encerrar (0):", chatId);
        resetSession(chatId);
        console.log("[MENU] Saindo do modo MENU:", chatId);
        break;

      default:
        await client.sendMessage(chatId, "⚠️ Opção inválida. Digite 1, 2, 3, 9 ou 0.");
        await sendMenuInicial(chatId);
        console.log("[MENU][ERROR] Opção inválida:", chatId, body);
        break;
    }
  } else if (session.step === "PLANOS") {
    // Validar entrada numérica
    if (!isNumericOnly(body)) {
      await client.sendMessage(chatId, "⚠️ Responda apenas com números (1, 2, 9 ou 0).");
      await sendPlanos(chatId);
      console.log("[MENU][ERROR] Entrada não numérica em PLANOS:", chatId, body);
      return;
    }

    // Processar escolhas numéricas do PLANOS
    switch (body) {
      case "1":
        await client.sendMessage(chatId, "✅ Plano Básico selecionado. (placeholder)");
        console.log("[PLANOS] Escolha 1 (Básico):", chatId);
        break;

      case "2":
        await client.sendMessage(chatId, "✅ Plano Pro selecionado. (placeholder)");
        console.log("[PLANOS] Escolha 2 (Pro):", chatId);
        break;

      case "9":
        session.step = "MENU_INICIAL";
        console.log("[ACTION] Voltar ao MENU_INICIAL:", chatId);
        await sendMenuInicial(chatId);
        break;

      case "0":
        await client.sendMessage(chatId, "✅ Atendimento encerrado. Quando quiser, digite 'menu' novamente.");
        console.log("[MENU] Encerrar (0):", chatId);
        session.mode = null;
        session.step = "MENU_INICIAL";
        console.log("[MENU] Saindo do modo MENU:", chatId);
        break;

      default:
        await client.sendMessage(chatId, "⚠️ Opção inválida. Digite 1, 2, 9 ou 0.");
        await sendPlanos(chatId);
        console.log("[PLANOS][ERROR] Opção inválida:", chatId, body);
        break;
    }
  }
}

// =====================================
// FUNÇÕES DE SESSÃO
// =====================================
function getSession(chatId) {
  let session = sessions.get(chatId);

  // Se não existir, criar nova
  if (!session) {
    session = {
      step: "MENU_INICIAL",
      data: {},
      lastMessageAt: Date.now()
    };
    sessions.set(chatId, session);
    console.log(`[SESSION] Nova sessão criada: ${chatId}`);
    return session;
  }

  // Se existir, verificar expiração
  const elapsed = Date.now() - session.lastMessageAt;
  if (elapsed > SESSION_TTL_MS) {
    console.log(`[SESSION] Sessão expirada, resetando: ${chatId}`);
    session.step = "MENU_INICIAL";
    session.data = {};
    session.lastMessageAt = Date.now();
    return session;
  }

  // Atualizar lastMessageAt
  session.lastMessageAt = Date.now();
  console.log(`[SESSION] Step atual: ${chatId} -> ${session.step}`);
  return session;
}

function resetSession(chatId) {
  sessions.delete(chatId);
  console.log(`[SESSION] Sessão removida: ${chatId}`);
}

// Status messages
const statusMessages = {
  waiting_qr: "Aguardando QR code",
  authenticated: "Autenticado",
  ready: "Pronto",
  disconnected: "Desconectado"
};

// =====================================
// CONFIGURAÇÃO DO CLIENTE WHATSAPP
// =====================================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: "new", // (ou false pra debugar)
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    timeout: 60000,
  },

  // 🔒 trava a versão do WhatsApp Web
  webVersion: "2.3000.1032180192-alpha",

  // 🌐 busca o HTML dessa versão no repositório de versões
  webVersionCache: {
    type: "remote",
    remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html",
    strict: false, // se der 404, ele tenta outra (evita quebrar tudo)
  },
});


// =====================================
// EVENTO: QR CODE
// =====================================
client.on("qr", (qr) => {
  console.log("📲 QR Code recebido - convertendo para DataURL");
  currentStatus = "waiting_qr";
  
  // Converter QR string para PNG DataURL
  qrcode.toDataURL(qr, {
    errorCorrectionLevel: "H",
    type: "image/png",
    width: 300,
    margin: 1,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    }
  }).then(dataUrl => {
    currentQrDataUrl = dataUrl;
    console.log("✅ QR Code convertido - emitindo aos clientes");
    io.emit("qr", { dataUrl: dataUrl });
    io.emit("status", {
      status: currentStatus,
      message: statusMessages[currentStatus]
    });
  }).catch(err => {
    console.error("❌ Erro ao converter QR code:", err.message);
  });
});

// =====================================
// EVENTO: AUTENTICADO
// =====================================
client.on("authenticated", () => {
  console.log("🔐 Autenticado");
  currentStatus = "authenticated";
  io.emit("status", {
    status: currentStatus,
    message: statusMessages[currentStatus]
  });
});

// =====================================
// EVENTO: PRONTO
// =====================================
client.on("ready", () => {
  console.log("✅ Tudo certo! WhatsApp conectado.");
  currentStatus = "ready";
  currentQrDataUrl = null; // Limpar QR após conexão
  io.emit("status", {
    status: currentStatus,
    message: statusMessages[currentStatus]
  });
});

// =====================================
// EVENTO: DESCONECTADO
// =====================================
client.on("disconnected", (reason) => {
  console.log("⚠️ Desconectado:", reason);
  currentStatus = "disconnected";
  io.emit("status", {
    status: currentStatus,
    message: statusMessages[currentStatus]
  });
});

// =====================================
// EVENTO: MENSAGENS (BOT)
// =====================================
client.on("message", async (msg) => {
  try {
    // ❌ IGNORA QUALQUER COISA QUE NÃO SEJA CONVERSA PRIVADA
    if (!msg.from || msg.from.endsWith("@g.us")) return;

    const chat = await msg.getChat();
    if (chat.isGroup) return;

    const chatId = msg.from;
    const body = normalizeInput(msg.body).toLowerCase();

    // Prevenir duplicate replies
    const msgId = msg.id._serialized;
    if (processedMessages.has(msgId)) {
      console.log("⏭️  Mensagem já processada (duplicate):", msgId);
      return;
    }
    addProcessedMessage(msgId);

    const contactId = chatId;
    const messageBody = msg.body || "";

    // =====================================
    // CONTROLE DE SESSÃO
    // =====================================
    const session = getSession(chatId);
    console.log(`[SESSION] Sessão ativa confirmada para ${chatId}`);

    const isMenuCommand = (body === COMMAND_MENU || body === "#menu" || body === "start");

    if (isMenuCommand) {
      session.step = "MENU_INICIAL";
      session.mode = "MENU";
      session.data = session.data || {};
      console.log("[COMMAND] Menu acionado:", chatId, "body=", body);
      console.log("[STEP] Step definido para MENU_INICIAL:", chatId);
      console.log("[SESSION] Modo MENU ativado:", chatId, "step=", session.step);
      await sendMenuInicial(chatId);
      return;
    }

    // Bloquear fluxo antigo quando em modo MENU
    if (session.mode === "MENU" && !isMenuCommand) {
      console.log("[MENU] Interceptando fluxo antigo (mode=MENU):", chatId);
      await handleMenuFlow(chatId, body, session);
      return;
    }

    console.log("[COMMAND] Nenhum comando:", chatId);

    // Função de digitação
    const delay = (ms) => new Promise((res) => setTimeout(res, ms));
    const typing = async () => {
      await delay(2000);
      await chat.sendStateTyping();
      await delay(2000);
    };

    let responseSent = false;

    // =====================================
    // TENTAR CORRESPONDÊNCIA COM REGRAS
    // =====================================
    const matchedRule = findMatchingRule(messageBody);
    
    if (matchedRule) {
      // Uma regra foi correspondida - usar a resposta da regra
      console.log(`📨 [${contactId}] Usando resposta da regra: "${matchedRule.sent}"`);
      await typing();
      await client.sendMessage(msg.from, matchedRule.sent);
      responseSent = true;
      markActivity(contactId); // Registrar após enviar
    } 
    else {
      // =====================================
      // TENTAR ENVIAR MENSAGEM DEFAULT
      // =====================================
      const settings = getSettingsSync();
      const defaultMessage = settings.defaultMessage.trim();

      if (defaultMessage) {
        // Determinar janela: ENV > settings > default (24h)
        const windowSeconds = parseInt(process.env.DEFAULT_WINDOW_SECONDS, 10) || 
                             settings.defaultWindowSeconds || 
                             (24 * 60 * 60);

        // Verificar se deve enviar default (janela configurável + ignorar msg atual)
        const canSendDefault = await shouldSendDefault(chat, contactId, { 
          windowSeconds,
          ignoreMsgId: msgId 
        });

        if (canSendDefault) {
          console.log(`💬 [${contactId}] Enviando mensagem default (janela: ${Math.floor(windowSeconds / 60)} min)`);
          await typing();
          await client.sendMessage(msg.from, defaultMessage);
          responseSent = true;
          markDefaultSent(contactId); // Marca default enviado + atividade
        }
      }

      // =====================================
      // FALLBACK: MENSAGEM INICIAL DE BOAS-VINDAS (LEGADO)
      // =====================================
      if (!responseSent) {
        const texto = messageBody.trim().toLowerCase();
        if (/^(menu|oi|olá|ola|bom dia|boa tarde|boa noite|#automação)$/i.test(texto)) {
          await typing();

          const hora = new Date().getHours();
          let saudacao = "Olá";

          if (hora >= 5 && hora < 12) saudacao = "Bom dia";
          else if (hora >= 12 && hora < 18) saudacao = "Boa tarde";
          else saudacao = "Boa noite";

          await client.sendMessage(
            msg.from,
            `${saudacao}! 👋\n\n` +
            `Essa mensagem foi enviada automaticamente pelo robô 🤖\n\n`
          );
          responseSent = true;
          markActivity(contactId); // Registrar após enviar
        }
      }
    }

    // Registrar atividade inbound no final (contato passou a estar dentro da janela)
    if (!responseSent) {
      markActivity(contactId);
    }
  } catch (err) {
    console.error("❌ Erro ao processar mensagem:", err.message);
  }
});

// =====================================
// EVENTO: MENSAGENS CRIADAS (CAPTURA ENVIOS MANUAIS)
// =====================================
client.on("message_create", async (msg) => {
  try {
    // Apenas mensagens enviadas por mim (bot ou usuário manual)
    if (!msg.fromMe) return;

    // Ignorar grupos
    if (msg.to && msg.to.endsWith("@g.us")) return;

    // Determinar o contato destinatário
    const contactId = msg.to || msg.from;
    
    if (contactId && !contactId.endsWith("@g.us")) {
      // Marcar atividade (mensagens enviadas manualmente também renovam janela)
      markActivity(contactId);
      console.log(`📤 [${contactId}] Mensagem enviada (manual ou bot) - atividade marcada`);
    }
  } catch (err) {
    console.error("❌ Erro ao processar message_create:", err.message);
  }
});

// =====================================
// INICIALIZAR CLIENTE WHATSAPP
// =====================================
client.on("loading_screen", (percent, message) => {
  console.log("⏳ Loading screen:", percent, message);
});

client.on("auth_failure", (msg) => {
  console.log("❌ auth_failure:", msg);
});

client.initialize().catch((err) => {
  console.error("❌ Erro ao inicializar cliente:", err.message);
  process.exit(1);
});

// =====================================
// SOCKET.IO: CONEXÃO DO CLIENTE
// =====================================
io.on("connection", (socket) => {
  console.log("🌐 Cliente conectado:", socket.id);

  // Enviar QR atual se disponível
  if (currentQrDataUrl) {
    socket.emit("qr", { dataUrl: currentQrDataUrl });
  }

  // Enviar status atual
  socket.emit("status", {
    status: currentStatus,
    message: statusMessages[currentStatus]
  });

  socket.on("disconnect", () => {
    console.log("🌐 Cliente desconectado:", socket.id);
  });
});

// =====================================
// ROTAS: PÁGINA PRINCIPAL
// =====================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "web", "index.html"));
});

app.get("/messages", (req, res) => {
  res.sendFile(path.join(__dirname, "web", "messages.html"));
});

// =====================================
// API REST: GET RULES
// =====================================
app.get("/api/rules", (req, res) => {
  try {
    if (fs.existsSync(RULES_FILE)) {
      const data = fs.readFileSync(RULES_FILE, "utf-8");
      const rules = JSON.parse(data);
      return res.json(rules);
    }
    return res.json([]);
  } catch (err) {
    console.error("❌ Erro ao ler regras:", err.message);
    return res.status(500).json({ error: "Erro ao ler regras" });
  }
});

// =====================================
// API REST: POST RULES
// =====================================
app.post("/api/rules", (req, res) => {
  try {
    const rules = req.body;

    // Validar que é um array
    if (!Array.isArray(rules)) {
      return res.status(400).json({ error: "Deve ser um array" });
    }

    // Validar e limpar cada regra
    const validatedRules = rules
      .map(rule => ({
        received: (rule.received || "").trim(),
        sent: (rule.sent || "").trim()
      }))
      .filter(rule => rule.received && rule.sent); // Remove linhas vazias

    // Salvar no arquivo
    fs.writeFileSync(RULES_FILE, JSON.stringify(validatedRules, null, 2));
    console.log("✅ Regras salvas:", validatedRules.length, "regra(s)");

    return res.json({ success: true, count: validatedRules.length });
  } catch (err) {
    console.error("❌ Erro ao salvar regras:", err.message);
    return res.status(500).json({ error: "Erro ao salvar regras" });
  }
});

// =====================================
// API REST: GET SETTINGS
// =====================================
app.get("/api/settings", (req, res) => {
  try {
    const settings = getSettingsSync();
    return res.json(settings);
  } catch (err) {
    console.error("❌ Erro ao ler settings:", err.message);
    return res.status(500).json({ error: "Erro ao ler settings" });
  }
});

// =====================================
// API REST: POST SETTINGS
// =====================================
app.post("/api/settings", (req, res) => {
  try {
    const { defaultMessage, defaultWindowSeconds } = req.body;

    // Validar message
    if (typeof defaultMessage !== "string") {
      return res.status(400).json({ error: "defaultMessage deve ser string" });
    }

    // Validar e preparar windowSeconds
    let windowSeconds = defaultWindowSeconds;
    if (windowSeconds === undefined || windowSeconds === null) {
      windowSeconds = 24 * 60 * 60; // 24 horas padrão
    } else if (typeof windowSeconds !== "number") {
      return res.status(400).json({ error: "defaultWindowSeconds deve ser número" });
    }

    // Validar range (10s a 7 dias)
    if (windowSeconds < 10 || windowSeconds > 604800) {
      return res.status(400).json({ error: "defaultWindowSeconds deve estar entre 10 segundos e 7 dias (604800 segundos)" });
    }

    // Salvar
    const success = saveSettingsSync({ 
      defaultMessage: defaultMessage.trim(),
      defaultWindowSeconds: Math.floor(windowSeconds)
    });

    if (success) {
      return res.json({ success: true });
    } else {
      return res.status(500).json({ error: "Erro ao salvar settings" });
    }
  } catch (err) {
    console.error("❌ Erro ao salvar settings:", err.message);
    return res.status(500).json({ error: "Erro ao salvar settings" });
  }
});

// =====================================
// INICIAR SERVIDOR HTTP
// =====================================
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});

// =====================================
// GRACEFUL SHUTDOWN
// =====================================
process.on("SIGINT", () => {
  console.log("\n🛑 Encerrando servidor...");
  client.destroy();
  httpServer.close(() => {
    console.log("✅ Servidor encerrado");
    process.exit(0);
  });
});
