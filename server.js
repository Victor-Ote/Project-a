const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const qrcode = require("qrcode");
const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");
const { findMatchingRule } = require("./src/rules/rulesStore");

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

// Função para limpar mensagens processadas após timeout
function addProcessedMessage(msgId) {
  processedMessages.add(msgId);
  setTimeout(() => {
    processedMessages.delete(msgId);
  }, DUPLICATE_TIMEOUT);
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
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    timeout: 60000,
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

    // Prevenir duplicate replies
    const msgId = msg.id._serialized;
    if (processedMessages.has(msgId)) {
      console.log("⏭️  Mensagem já processada (duplicate):", msgId);
      return;
    }
    addProcessedMessage(msgId);

    const messageBody = msg.body || "";

    // Função de digitação
    const delay = (ms) => new Promise((res) => setTimeout(res, ms));
    const typing = async () => {
      await delay(2000);
      await chat.sendStateTyping();
      await delay(2000);
    };

    // =====================================
    // TENTAR CORRESPONDÊNCIA COM REGRAS
    // =====================================
    const matchedRule = findMatchingRule(messageBody);
    
    if (matchedRule) {
      // Uma regra foi correspondida - usar a resposta da regra
      console.log(`📨 Usando resposta da regra: "${matchedRule.sent}"`);
      await typing();
      await client.sendMessage(msg.from, matchedRule.sent);
      return;
    }

    // =====================================
    // FALLBACK: MENSAGEM INICIAL DE BOAS-VINDAS
    // =====================================
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
    }
  } catch (err) {
    console.error("❌ Erro ao processar mensagem:", err.message);
  }
});

// =====================================
// INICIALIZAR CLIENTE WHATSAPP
// =====================================
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
