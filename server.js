const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const qrcode = require("qrcode");
const Database = require("better-sqlite3");
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
// DATABASE SQLite
// =====================================
const DB_FILE = path.resolve(DATA_DIR, "app.db");
let db = null;

function initDb() {
  db = new Database(DB_FILE);
  
  // Criar tabelas
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      token TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS configs (
      token TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  
  console.log("[DB] SQLite iniciado em ./data/app.db");
  console.log("[DB] Tabelas garantidas: tenants, configs");
}

async function dbGetTenant(token) {
  const stmt = db.prepare("SELECT token, tenant_id FROM tenants WHERE token = ?");
  const result = stmt.get(token);
  console.log("[DB] Tenant SELECT:", token, result ? "true" : "false");
  return result || null;
}

async function dbInsertTenant(token, tenantId) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tenants (token, tenant_id, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(token, tenantId, now, now);
  console.log("[DB] Tenant UPSERT:", token, tenantId);
}

async function dbGetConfig(token) {
  const stmt = db.prepare("SELECT config_json FROM configs WHERE token = ?");
  const result = stmt.get(token);
  console.log("[DB] Config SELECT:", token, result ? "true" : "false");
  return result ? result.config_json : null;
}

async function dbUpsertConfig(token, configObj) {
  const now = new Date().toISOString();
  const json = JSON.stringify(configObj);
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO configs (token, config_json, updated_at)
    VALUES (?, ?, ?)
  `);
  stmt.run(token, json, now);
  console.log("[DB] Config UPSERT:", token, "bytes=", json.length);
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

initDb();

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

// =====================================
// MULTI-TENANT POR TOKEN
// =====================================
const TENANTS = new Map();
const DEFAULT_TENANT_ID = "default";

async function getOrCreateTenantByToken(token) {
  // Verificar se já está em memória
  let tenant = null;
  for (const [, t] of TENANTS) {
    if (t.token === token) {
      tenant = t;
      break;
    }
  }
  
  if (tenant) {
    console.log("[TENANT] Encontrado em memória:", tenant.tenantId);
    return tenant;
  }

  // Buscar no banco de dados
  const dbTenant = await dbGetTenant(token);
  
  if (dbTenant) {
    // Tenant existe no DB, carregar config
    const tenantId = dbTenant.tenant_id;
    const configJson = await dbGetConfig(token);
    let config;
    
    if (configJson) {
      config = JSON.parse(configJson);
    } else {
      // Criar config padrão se não existir
      config = JSON.parse(JSON.stringify(MENU_CONFIG));
      await dbUpsertConfig(token, config);
    }
    
    tenant = {
      tenantId,
      token,
      config,
      createdAt: Date.now()
    };
    TENANTS.set(tenantId, tenant);
    console.log("[TENANT] DB load complete:", tenantId, "token=", token);
    return tenant;
  }

  // Criar novo tenant
  const tenantId = "t_" + token.slice(0, 8);
  const config = JSON.parse(JSON.stringify(MENU_CONFIG));
  
  // Persistir no DB
  await dbInsertTenant(token, tenantId);
  await dbUpsertConfig(token, config);
  
  tenant = {
    tenantId,
    token,
    config,
    createdAt: Date.now()
  };
  TENANTS.set(tenantId, tenant);
  console.log("[TENANT] Criado:", tenantId, "token=", token);
  console.log("[TENANT] DB load complete:", tenantId, "token=", token);
  return tenant;
}

async function getTenantFromRequest(req) {
  const { token } = req.params;
  if (!token || token.length < 10) {
    return { error: "Token inválido ou ausente", statusCode: 400 };
  }
  const tenant = await getOrCreateTenantByToken(token);
  return tenant;
}

function getTenantConfig(tenantId) {
  console.log("[CONFIG] getTenantConfig tenantId=", tenantId, "source=TENANTS");
  const tenant = TENANTS.get(tenantId);
  return tenant ? tenant.config : MENU_CONFIG;
}

const MENU_CONFIG = {
  triggers: ["menu", "#menu", "start"],
  texts: {
    encerrado: "✅ Atendimento encerrado. Quando quiser, digite 'menu' novamente.",
    somenteNumerosMenu: "⚠️ Responda apenas com números (1, 2, 3, 9 ou 0).",
    somenteNumerosPlanos: "⚠️ Responda apenas com números (1, 2, 9 ou 0).",
    opcaoInvalidaMenu: "⚠️ Opção inválida. Digite 1, 2, 3, 9 ou 0.",
    opcaoInvalidaPlanos: "⚠️ Opção inválida. Digite 1, 2, 9 ou 0.",
    planosBasico: "✅ Plano Básico selecionado. (placeholder)",
    planosPro: "✅ Plano Pro selecionado. (placeholder)",
    comoFuncionaPlaceholder: "✅ Você escolheu: Como funciona (placeholder)",
    atendentePlaceholder: "✅ Você escolheu: Falar com atendente (placeholder)"
  },
  steps: {
    MENU_INICIAL: {
      header: "Olá! 👋\nResponda apenas com um número:",
      options: [
        "1️⃣ Planos",
        "2️⃣ Como funciona",
        "3️⃣ Falar com atendente",
        "",
        "9️⃣ Repetir menu",
        "0️⃣ Encerrar"
      ]
    },
    PLANOS: {
      header: "📦 *Planos*\nResponda apenas com um número:",
      options: [
        "1️⃣ Plano Básico",
        "2️⃣ Plano Pro",
        "",
        "9️⃣ Voltar ao menu",
        "0️⃣ Encerrar"
      ]
    }
  }
};
console.log("[CONFIG] MENU_CONFIG carregado. Triggers:", MENU_CONFIG.triggers.join(", "));

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

function getMenuInicialText(config) {
  const { header, options } = config.steps.MENU_INICIAL;
  return `${header}\n\n${options.join("\n")}`;
}

async function sendMenuInicial(chatId, config) {
  console.log("[FLOW] Enviando MENU_INICIAL:", chatId);
  console.log("[CONFIG] Step text source: MENU_CONFIG.steps.MENU_INICIAL");
  await client.sendMessage(chatId, getMenuInicialText(config));
  console.log("[FLOW] MENU_INICIAL enviado:", chatId);
}

function getPlanosText(config) {
  const { header, options } = config.steps.PLANOS;
  return `${header}\n\n${options.join("\n")}`;
}

async function sendPlanos(chatId, config) {
  console.log("[FLOW] Enviando PLANOS:", chatId);
  console.log("[CONFIG] Step text source: MENU_CONFIG.steps.PLANOS");
  await client.sendMessage(chatId, getPlanosText(config));
  console.log("[FLOW] PLANOS enviado:", chatId);
}

function isNumericOnly(body) {
  return /^[0-9]+$/.test(body);
}

async function handleMenuFlow(tenantId, chatId, body, session, config) {
  console.log("[MENU] Entrada recebida:", chatId, "body=", body, "step=", session.step);

  if (session.step === "MENU_INICIAL") {
    // Validar entrada numérica
    if (!isNumericOnly(body)) {
      await client.sendMessage(chatId, config.texts.somenteNumerosMenu);
      await sendMenuInicial(chatId, config);
      console.log("[MENU][ERROR] Entrada não numérica no MENU_INICIAL:", chatId, body);
      return;
    }

    // Processar escolhas numéricas
    switch (body) {
      case "1":
        session.step = "PLANOS";
        console.log("[STEP] Alterando step:", chatId, "=>", session.step);
        await sendPlanos(chatId, config);
        break;

      case "2":
        await client.sendMessage(chatId, config.texts.comoFuncionaPlaceholder);
        console.log("[MENU] Escolha 2 (Como funciona):", chatId);
        break;

      case "3":
        await client.sendMessage(chatId, config.texts.atendentePlaceholder);
        console.log("[MENU] Escolha 3 (Atendente):", chatId);
        break;

      case "9":
        await sendMenuInicial(chatId, config);
        console.log("[MENU] Repetir menu (9):", chatId);
        break;

      case "0":
        await client.sendMessage(chatId, config.texts.encerrado);
        console.log("[MENU] Encerrar (0):", chatId);
        resetSession(tenantId, chatId);
        console.log("[MENU] Saindo do modo MENU:", chatId);
        break;

      default:
        await client.sendMessage(chatId, config.texts.opcaoInvalidaMenu);
        await sendMenuInicial(chatId, config);
        console.log("[MENU][ERROR] Opção inválida:", chatId, body);
        break;
    }
  } else if (session.step === "PLANOS") {
    // Validar entrada numérica
    if (!isNumericOnly(body)) {
      await client.sendMessage(chatId, config.texts.somenteNumerosPlanos);
      await sendPlanos(chatId, config);
      console.log("[MENU][ERROR] Entrada não numérica em PLANOS:", chatId, body);
      return;
    }

    // Processar escolhas numéricas do PLANOS
    switch (body) {
      case "1":
        await client.sendMessage(chatId, config.texts.planosBasico);
        console.log("[PLANOS] Escolha 1 (Básico):", chatId);
        break;

      case "2":
        await client.sendMessage(chatId, config.texts.planosPro);
        console.log("[PLANOS] Escolha 2 (Pro):", chatId);
        break;

      case "9":
        session.step = "MENU_INICIAL";
        console.log("[ACTION] Voltar ao MENU_INICIAL:", chatId);
        await sendMenuInicial(chatId, config);
        break;

      case "0":
        await client.sendMessage(chatId, config.texts.encerrado);
        console.log("[MENU] Encerrar (0):", chatId);
        session.mode = null;
        session.step = "MENU_INICIAL";
        console.log("[MENU] Saindo do modo MENU:", chatId);
        break;

      default:
        await client.sendMessage(chatId, config.texts.opcaoInvalidaPlanos);
        await sendPlanos(chatId, config);
        console.log("[PLANOS][ERROR] Opção inválida:", chatId, body);
        break;
    }
  }
}

// =====================================
// FUNÇÕES DE SESSÃO
// =====================================
function getSession(tenantId, chatId) {
  const sessionKey = `${tenantId}:${chatId}`;
  let session = sessions.get(sessionKey);

  // Se não existir, criar nova
  if (!session) {
    session = {
      step: "MENU_INICIAL",
      data: {},
      lastMessageAt: Date.now()
    };
    sessions.set(sessionKey, session);
    console.log(`[SESSION] Nova sessão criada:`, sessionKey);
    console.log("[SESSION] Key:", sessionKey, "step=", session.step);
    return session;
  }

  // Se existir, verificar expiração
  const elapsed = Date.now() - session.lastMessageAt;
  if (elapsed > SESSION_TTL_MS) {
    console.log(`[SESSION] Sessão expirada, resetando:`, sessionKey);
    session.step = "MENU_INICIAL";
    session.data = {};
    session.lastMessageAt = Date.now();
    console.log("[SESSION] Key:", sessionKey, "step=", session.step);
    return session;
  }

  // Atualizar lastMessageAt
  session.lastMessageAt = Date.now();
  console.log("[SESSION] Key:", sessionKey, "step=", session.step);
  return session;
}

function resetSession(tenantId, chatId) {
  const sessionKey = `${tenantId}:${chatId}`;
  sessions.delete(sessionKey);
  console.log(`[SESSION] Sessão removida:`, sessionKey);
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
    const tenantId = DEFAULT_TENANT_ID;
    console.log("[SOCKET] Emitindo para tenant:", tenantId, "event=", "qr");
    io.to(tenantId).emit("qr", dataUrl);
    io.emit("qr", dataUrl);
    console.log("[SOCKET] QR emit fallback global. tenantId=", tenantId, "clients=", io.engine.clientsCount);
    console.log("[SOCKET] Emitindo para tenant:", tenantId, "event=", "status");
    io.to(tenantId).emit("status", {
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
  const tenantId = DEFAULT_TENANT_ID;
  console.log("[SOCKET] Emitindo para tenant:", tenantId, "event=", "status");
  io.to(tenantId).emit("status", {
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
  const tenantId = DEFAULT_TENANT_ID;
  console.log("[SOCKET] Emitindo para tenant:", tenantId, "event=", "status");
  io.to(tenantId).emit("status", {
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
  const tenantId = DEFAULT_TENANT_ID;
  console.log("[SOCKET] Emitindo para tenant:", tenantId, "event=", "status");
  io.to(tenantId).emit("status", {
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
    const tenantId = DEFAULT_TENANT_ID; // Por enquanto, hardcoded

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
    const session = getSession(tenantId, chatId);
    console.log(`[SESSION] Sessão ativa confirmada para ${tenantId}:${chatId}`);

    const tenantConfig = getTenantConfig(tenantId);
    const isMenuCommand = tenantConfig.triggers.includes(body);

    if (isMenuCommand) {
      session.step = "MENU_INICIAL";
      session.mode = "MENU";
      session.data = session.data || {};
      console.log("[COMMAND] Menu acionado:", chatId, "body=", body);
      console.log("[STEP] Step definido para MENU_INICIAL:", chatId);
      console.log("[SESSION] Modo MENU ativado:", chatId, "step=", session.step);
      await sendMenuInicial(chatId, tenantConfig);
      return;
    }

    // Bloquear fluxo antigo quando em modo MENU
    if (session.mode === "MENU" && !isMenuCommand) {
      console.log("[MENU] Interceptando fluxo antigo (mode=MENU):", chatId);
      await handleMenuFlow(tenantId, chatId, body, session, tenantConfig);
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

  // Evento para o cliente entrar em uma sala de tenant
  socket.on("joinTenant", async ({ token }) => {
    const tenant = await getOrCreateTenantByToken(token);
    socket.join(tenant.tenantId);
    socket.data.tenantId = tenant.tenantId;
    console.log("[SOCKET] joinTenant:", socket.id, "tenantId=", tenant.tenantId);
  });

  // Enviar QR atual se disponível
  if (currentQrDataUrl) {
    const tenantId = socket.data.tenantId || DEFAULT_TENANT_ID;
    console.log("[SOCKET] Emitindo para tenant:", tenantId, "event=", "qr");
    io.to(tenantId).emit("qr", { dataUrl: currentQrDataUrl });
  }

  // Enviar status atual
  const tenantId = socket.data.tenantId || DEFAULT_TENANT_ID;
  console.log("[SOCKET] Emitindo para tenant:", tenantId, "event=", "status");
  io.to(tenantId).emit("status", {
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
// ROTAS: MULTI-TENANT
// =====================================
app.get("/t/:token/health", async (req, res) => {
  const result = await getTenantFromRequest(req);
  if (result.error) {
    return res.status(result.statusCode || 400).json(result);
  }
  const { tenantId, token } = result;
  res.json({
    ok: true,
    tenantId,
    tokenMasked: token.slice(0, 4) + "..."
  });
});

// =====================================
// ROTAS: API
// =====================================

// =====================================
// API REST: MULTI-TENANT CONFIG
// =====================================
app.get("/t/:token/config", async (req, res) => {
  try {
    const result = await getTenantFromRequest(req);
    if (result.error) {
      return res.status(result.statusCode || 400).json(result);
    }
    const tenant = await getOrCreateTenantByToken(result.token);
    console.log("[API] GET config:", tenant.tenantId);
    res.json(tenant.config);
  } catch (err) {
    console.error("❌ Erro ao obter config:", err.message);
    res.status(500).json({ error: "Erro ao obter config" });
  }
});

app.put("/t/:token/config", async (req, res) => {
  try {
    const result = await getTenantFromRequest(req);
    if (result.error) {
      return res.status(result.statusCode || 400).json(result);
    }

    const body = req.body;
    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      return res.status(400).json({ error: "Body deve ser um objeto válido" });
    }

    const tenant = await getOrCreateTenantByToken(result.token);
    tenant.config = body;
    await dbUpsertConfig(result.token, body);

    console.log("[API] PUT config:", tenant.tenantId);
    console.log("[CONFIG] Runtime atualizado para tenant:", tenant.tenantId);
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Erro ao atualizar config:", err.message);
    res.status(500).json({ error: "Erro ao atualizar config" });
  }
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
