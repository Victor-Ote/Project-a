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
// NORMALIZAÇÃO DE TOKENS
// =====================================
function normalizeToken(token) {
  if (!token) return "";
  const normalized = String(token).trim().toLowerCase();
  return normalized;
}

function validateToken(token) {
  const normalized = normalizeToken(token);
  if (!normalized || normalized.length < 5) {
    return { valid: false, normalized, error: "Token inválido ou muito curto" };
  }
  return { valid: true, normalized };
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
      tenant_id TEXT PRIMARY KEY,
      menu_json TEXT,
      rules_json TEXT,
      settings_json TEXT,
      updated_at TEXT NOT NULL
  );

  `);
  
  console.log("[DB] SQLite iniciado em ./data/app.db");
  console.log("[DB] Tabelas garantidas: tenants, configs");
  
  // =====================================
  // MIGRAÇÃO: Verificar e adicionar coluna tenant_id se necessário
  // =====================================
  try {
    // Verificar se coluna tenant_id já existe
    const tableInfo = db.prepare("PRAGMA table_info(configs)").all();
    const hasTenantId = tableInfo.some(col => col.name === "tenant_id");
    
    if (!hasTenantId) {
      console.log("[DB][MIGRATION] Adicionando coluna tenant_id à tabela configs");
      db.exec("ALTER TABLE configs ADD COLUMN tenant_id TEXT;");
      console.log("[DB][MIGRATION] tenant_id added");
    } else {
      console.log("[DB][MIGRATION] tenant_id already exists");
    }
  } catch (err) {
    console.error("[DB][MIGRATION][ERROR]", err.message);
  }
  
  // Criar índice único se não existir
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_configs_tenant_id ON configs(tenant_id);");
    console.log("[DB][MIGRATION] Índice idx_configs_tenant_id garantido");
  } catch (err) {
    console.error("[DB][MIGRATION][ERROR] ao criar índice:", err.message);
  }
}

async function dbGetTenant(token) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return null;
  
  const stmt = db.prepare("SELECT token, tenant_id FROM tenants WHERE token = ?");
  const result = stmt.get(normalizedToken);
  console.log("[DB] Tenant SELECT:", normalizedToken, result ? "true" : "false");
  return result || null;
}

async function dbInsertTenant(token, tenantId) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) {
    console.error("[DB] Não posso inserir tenant com token vazio");
    return false;
  }
  
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tenants (token, tenant_id, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(normalizedToken, tenantId, now, now);
  console.log("[DB] Tenant UPSERT:", normalizedToken, tenantId);
  return true;
}

function dbGetConfig(token) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return null;
  
  // 1) acha tenant_id pelo token
  const rowTenant = db
    .prepare("SELECT tenant_id FROM tenants WHERE token = ?")
    .get(normalizedToken);

  if (!rowTenant?.tenant_id) {
    return null;
  }

  // 2) pega config pelo tenant_id no schema novo
  const row = db
    .prepare("SELECT menu_json, rules_json, settings_json, updated_at FROM configs WHERE tenant_id = ?")
    .get(rowTenant.tenant_id);

  if (!row) return null;

  return {
    tenantId: rowTenant.tenant_id,
    menu: row.menu_json ? safeJsonParse(row.menu_json) : null,
    rules: row.rules_json ? safeJsonParse(row.rules_json) : null,
    settings: row.settings_json ? safeJsonParse(row.settings_json) : null,
    updated_at: row.updated_at,
  };
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}


async function dbUpsertConfig(token, configObj) {
  // DEPRECATED: Use dbUpsertConfigByTenantId instead
  // Manter para compatibilidade com código antigo, mas redirecionar para o novo método
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) {
    console.error("[DB] Config UPSERT failed: token normalizado vazio");
    return;
  }
  
  const rowTenant = db
    .prepare("SELECT tenant_id FROM tenants WHERE token = ?")
    .get(normalizedToken);

  if (!rowTenant?.tenant_id) {
    console.error("[DB] Config UPSERT failed: token não encontrado em tenants");
    return;
  }

  // Se configObj for completo (com __rules e __settings), extrair componentes
  let menu = configObj;
  let rules = RULES_DEFAULT;
  let settings = SETTINGS_DEFAULT;

  if (configObj?.__rules || configObj?.__settings) {
    menu = Object.assign({}, configObj);
    delete menu.__rules;
    delete menu.__settings;
    rules = configObj.__rules ?? RULES_DEFAULT;
    settings = configObj.__settings ?? SETTINGS_DEFAULT;
  }

  await dbUpsertConfigByTenantId(rowTenant.tenant_id, menu, rules, settings);
  console.log("[DB] Config UPSERT (via dbUpsertConfig):", normalizedToken, "tenantId=", rowTenant.tenant_id);
}

function dbGetConfigByTenantId(tenantId) {
  const stmt = db.prepare(`
    SELECT menu_json, rules_json, settings_json, updated_at FROM configs WHERE tenant_id = ?
  `);
  const result = stmt.get(tenantId);
  if (result) {
    console.log("[DB] Config SELECT by tenantId:", tenantId, "found");
    return {
      menu: result.menu_json ? safeJsonParse(result.menu_json) : null,
      rules: result.rules_json ? safeJsonParse(result.rules_json) : null,
      settings: result.settings_json ? safeJsonParse(result.settings_json) : null,
      updated_at: result.updated_at || null
    };
  }
  console.log("[DB] Config SELECT by tenantId:", tenantId, "not found");
  return { menu: null, rules: null, settings: null, updated_at: null };
}

async function dbUpsertConfigByTenantId(tenantId, menu, rules, settings) {
  const now = new Date().toISOString();
  const menuJson = menu ? JSON.stringify(menu) : null;
  const rulesJson = rules ? JSON.stringify(rules) : null;
  const settingsJson = settings ? JSON.stringify(settings) : null;
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO configs (tenant_id, menu_json, rules_json, settings_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(tenantId, menuJson, rulesJson, settingsJson, now);
  console.log("[DB] Config UPSERT by tenantId:", tenantId, 
    "menu=", !!menu, "rules=", Array.isArray(rules) ? rules.length : 0, 
    "settings=", !!settings);
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
const CLIENTS_MAP = new Map();
const AUTH_BASE = path.resolve(__dirname, ".wwebjs_auth");

function emitTenant(tenantId, eventName, payload) {
  io.to(tenantId).emit(eventName, payload);
  const clientsInRoom = io.sockets.adapter.rooms.get(tenantId)?.size || 0;
  console.log("[SOCKET] emitTenant", tenantId, "event=", eventName, "clientsInRoom=", clientsInRoom);
}

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_BASE)) {
    fs.mkdirSync(AUTH_BASE, { recursive: true });
  }
  console.log("[WPP] Auth base ok:", AUTH_BASE);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeCleanupTenantSession(tenantId) {
  try {
    const sessionPath = path.join(AUTH_BASE, `session-tenant_${tenantId}`);
    const delays = [500, 1000, 1500, 2000, 2500, 3000];

    for (let i = 0; i < delays.length; i++) {
      try {
        await fs.promises.rm(sessionPath, { recursive: true, force: true });
        console.log("[WPP] session cleanup ok", "tenant=", tenantId, "path=", sessionPath);
        return true;
      } catch (err) {
        const code = err?.code;
        if (code === "EBUSY" || code === "EPERM") {
          console.warn("[WPP] session cleanup retry", "tenant=", tenantId, "attempt=", i + 1, "code=", code);
          await sleep(delays[i]);
          continue;
        }
        console.error("[WPP] session cleanup failed", "tenant=", tenantId, "code=", code, "msg=", err?.message);
        return false;
      }
    }
  } catch (err) {
    console.error("[WPP] session cleanup unexpected error", "tenant=", tenantId, "msg=", err?.message);
  }
  return false;
}

async function getOrCreateTenantByToken(token) {
  const normalizedToken = normalizeToken(token);
  
  if (!normalizedToken) {
    console.error("[TENANT] Token normalizado vazio, não posso criar tenant");
    return null;
  }
  
  // Verificar se já está em memória
  let tenant = null;
  for (const [, t] of TENANTS) {
    if (t.token === normalizedToken) {
      tenant = t;
      break;
    }
  }
  
  if (tenant) {
    console.log("[TENANT] Encontrado em memória:", tenant.tenantId);
    return tenant;
  }

  // Buscar no banco de dados
  const dbTenant = await dbGetTenant(normalizedToken);
  
  if (dbTenant) {
    // Tenant existe no DB, carregar config
    const tenantId = dbTenant.tenant_id;
    const dbConfigObj = await dbGetConfig(normalizedToken); // Retorna objeto, NÃO string
    
    // Carregar com fallbacks corretos (dbGetConfig retorna objeto com menu/rules/settings)
    const menu = dbConfigObj?.menu ?? JSON.parse(JSON.stringify(MENU_CONFIG));
    const rules = dbConfigObj?.rules ?? RULES_DEFAULT;
    const settings = dbConfigObj?.settings ?? SETTINGS_DEFAULT;
    
    // Montar config completa
    const config = Object.assign({}, menu, { __rules: rules, __settings: settings });
    
    tenant = {
      tenantId,
      token: normalizedToken,
      config,
      createdAt: Date.now()
    };
    TENANTS.set(tenantId, tenant);
    console.log("[TENANT] DB load complete:", tenantId, "token=", normalizedToken, 
      "menu=", !!menu, "rules=", Array.isArray(rules) ? rules.length : 0);
    return tenant;
  }

  // Criar novo tenant
  const tenantId = "t_" + normalizedToken.slice(0, 8);
  const menu = JSON.parse(JSON.stringify(MENU_CONFIG));
  const rules = RULES_DEFAULT;
  const settings = SETTINGS_DEFAULT;
  
  // Persistir no DB (tenant + config completa)
  await dbInsertTenant(normalizedToken, tenantId);
  await dbUpsertConfigByTenantId(tenantId, menu, rules, settings);
  
  const config = Object.assign({}, menu, { __rules: rules, __settings: settings });
  
  tenant = {
    tenantId,
    token: normalizedToken,
    config,
    createdAt: Date.now()
  };
  TENANTS.set(tenantId, tenant);
  console.log("[TENANT] Criado:", tenantId, "token=", normalizedToken);
  console.log("[TENANT] DB save complete:", tenantId, "token=", normalizedToken,
    "menu=", !!menu, "rules=", Array.isArray(rules) ? rules.length : 0);
  return tenant;
}

async function getTenantFromRequest(req) {
  let { token } = req.params;
  
  token = normalizeToken(token);
  
  if (!token || token.length < 5) {
    return { error: "Token inválido ou ausente", statusCode: 400 };
  }
  const tenant = await getOrCreateTenantByToken(token);
  return tenant;
}

function getTenantConfig(tenantId) {
  // Tentar carregar do DB primeiro (sync)
  const dbConfig = dbGetConfigByTenantId(tenantId);
  
  const hasDbData = dbConfig.menu || dbConfig.rules || dbConfig.settings;
  
  if (hasDbData) {
    const menu = dbConfig.menu || MENU_CONFIG;
    const rules = dbConfig.rules || RULES_DEFAULT;
    const settings = dbConfig.settings || SETTINGS_DEFAULT;
    
    console.log("[CONFIG] getTenantConfig tenantId=", tenantId, "source=DB",
      "rules=", Array.isArray(rules) ? rules.length : 0,
      "defaultMessageLen=", settings?.defaultMessage?.length || 0);
    
    // Compatível com o fluxo antigo do bot
    return Object.assign({}, menu, { __rules: rules, __settings: settings });
  }
  
  console.log("[CONFIG] getTenantConfig tenantId=", tenantId, "source=DEFAULT",
    "rules=", RULES_DEFAULT.length, "defaultMessageLen=", SETTINGS_DEFAULT.defaultMessage.length);
  
  return Object.assign({}, MENU_CONFIG, { __rules: RULES_DEFAULT, __settings: SETTINGS_DEFAULT });
}

// =====================================
// ANEXAR HANDLERS DE AUTOMAÇÃO AO CLIENT
// =====================================
function attachBotHandlers(client, tenantId) {
  // Evitar duplicação de handlers
  if (client.__handlersAttached) {
    console.log("[BOT] Handlers já anexados tenant=", tenantId);
    return;
  }
  client.__handlersAttached = true;
  console.log("[BOT] Handlers attached tenant=", tenantId);

  client.on("message", async (msg) => {
    try {
      // ❌ IGNORA QUALQUER COISA QUE NÃO SEJA CONVERSA PRIVADA
      if (!msg.from || msg.from.endsWith("@g.us")) return;

      const chat = await msg.getChat();
      if (chat.isGroup) return;

      const chatId = msg.from;
      const body = normalizeInput(msg.body).toLowerCase();

      console.log("[BOT] msg received tenant=", tenantId, "from=", msg.from, "body=", msg.body);

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

      // Adaptar menu para novo formato (compatibilidade)
      const menu = adaptLegacyMenuFormat(tenantConfig);
      const triggers = menu?.triggers || [];
      const normalizedTriggers = triggers.map(t => normalizeInput(t));
      const isMenuCommand = normalizedTriggers.includes(body);

      if (isMenuCommand) {
        const homeStep = "MENU_INICIAL";
        session.step = homeStep;
        session.stack = [];
        session.mode = "MENU";
        session.data = session.data || {};
        
        console.log("[COMMAND] Menu acionado:", chatId, "body=", body);
        console.log("[STEP] Step definido para:", homeStep, "chatId=", chatId);
        console.log("[SESSION] Modo MENU ativado:", chatId, "step=", session.step);
        
        try {
          const step = getStep(menu, homeStep);
          if (step) {
            await client.sendMessage(chatId, renderStep(step));
            console.log("[FLOW] Menu inicial enviado (engine):", chatId);
          } else {
            console.error("[FLOW] Step MENU_INICIAL não encontrado");
          }
        } catch (e) {
          console.error("[FLOW][ERROR] tenant=", tenantId, e?.message, e?.stack);
        }
        return;
      }

      // Bloquear fluxo antigo quando em modo MENU
      if (session.mode === "MENU" && !isMenuCommand) {
        console.log("[MENU] Interceptando fluxo antigo (mode=MENU):", chatId);
        try {
          await handleMenuFlow(client, tenantId, chatId, body, session, tenantConfig);
        } catch (e) {
          console.error("[FLOW][ERROR] tenant=", tenantId, e?.message, e?.stack);
        }
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
        console.log("[BOT] responding tenant=", tenantId, "to=", msg.from);
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
            console.log("[BOT] responding tenant=", tenantId, "to=", msg.from);
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

            console.log("[BOT] responding tenant=", tenantId, "to=", msg.from);
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
      console.error("❌ Erro ao processar mensagem tenant:", tenantId, err.message);
    }
  });

  // Também anexar message_create para marcar atividade de envios manuais
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
}

async function getOrCreateClientForTenant(tenant) {
  const tenantId = tenant.tenantId;
  const cached = CLIENTS_MAP.get(tenantId);
  
  // NÃO reutilizar se status for "disconnected" - sempre criar novo
  if (cached && cached.client && cached.status !== "disconnected") {
    console.log("[WPP] Reutilizando client para tenant:", tenantId, "status=", cached.status);
    return cached.client;
  }

  // Se existia client disconnected, remover do cache
  if (cached && cached.status === "disconnected") {
    console.log("[WPP] client was disconnected, recreating tenant=", tenantId);
    CLIENTS_MAP.delete(tenantId);
  }

  console.log("[WPP] Criando novo client para tenant:", tenantId);
  ensureAuthDir();

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: "tenant_" + tenantId }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ],
      timeout: 60000
    },
    webVersion: "2.3000.1032180192-alpha",
    webVersionCache: {
      type: "remote",
      remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html",
      strict: false
    }
  });

  CLIENTS_MAP.set(tenantId, { client, status: "initializing", lastQrAt: null });

  // Listeners
  client.on("qr", async (qr) => {
    console.log("[WPP] qr recebido tenant:", tenantId);
    
    try {
      const dataUrl = await qrcode.toDataURL(qr, {
        errorCorrectionLevel: "H",
        type: "image/png",
        width: 300,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#FFFFFF"
        }
      });
      
      const cached = CLIENTS_MAP.get(tenantId);
      if (cached) {
        cached.status = "qr";
        cached.lastQrAt = Date.now();
      }
      
      emitTenant(tenantId, "qr", dataUrl);
      emitTenant(tenantId, "status", "QR code recebido");
    } catch (err) {
      console.error("❌ Erro ao converter QR code tenant:", tenantId, err.message);
    }
  });

  client.on("authenticated", () => {
    console.log("[WPP] authenticated tenant:", tenantId);
    const cached = CLIENTS_MAP.get(tenantId);
    if (cached) cached.status = "authenticated";
    emitTenant(tenantId, "status", "Autenticado");
  });

  client.on("ready", () => {
    console.log("[WPP] ready tenant:", tenantId);
    const cached = CLIENTS_MAP.get(tenantId);
    if (cached) cached.status = "ready";
    emitTenant(tenantId, "status", "✅ Tudo certo! WhatsApp conectado.");
  });

  client.on("disconnected", async (reason) => {
    console.log("[WPP] disconnected tenant:", tenantId, "reason=", reason);
    const cached = CLIENTS_MAP.get(tenantId);
    if (cached) cached.status = "disconnected";
    emitTenant(tenantId, "status", "Desconectado: " + reason);

    if (reason === "LOGOUT") {
      // INVALIDAR IMEDIATAMENTE para não reutilizar client
      CLIENTS_MAP.delete(tenantId);
      console.log("[WPP] client invalidated immediately after LOGOUT tenant=", tenantId);

      // Depois fazer cleanup
      try {
        await client.destroy();
      } catch (e) {
        console.warn("[WPP] destroy failed on LOGOUT", "tenant=", tenantId, "msg=", e?.message);
      }

      await sleep(1500);
      await safeCleanupTenantSession(tenantId);
    }
  });

  // Inicializar
  console.log("[WPP] initialize start tenant:", tenantId);
  client.initialize()
    .then(() => console.log("[WPP] initialize called tenant:", tenantId))
    .catch(e => console.log("[WPP][ERROR] initialize tenant:", tenantId, e));

  // Anexar handlers de automação
  attachBotHandlers(client, tenantId);

  return client;
}

// =====================================
// ENGINE DE FLUXO CONFIGURÁVEL
// =====================================

/**
 * Adaptador para converter formato antigo (triggers/texts/steps) para novo formato
 */
function adaptLegacyMenuFormat(oldMenu) {
  if (!oldMenu) return null;

  // Se já está no novo formato (steps.text + routes array), retornar como está
  const hasNewSteps = oldMenu.steps && Object.values(oldMenu.steps).some(s => s?.text || Array.isArray(s?.routes));
  if (hasNewSteps && Array.isArray(oldMenu.triggers)) {
    return oldMenu;
  }

  // Converter formato antigo para novo (compatibilidade)
  const newMenu = {
    triggers: oldMenu.triggers || ["menu"],
    steps: {}
  };

  if (oldMenu.steps) {
    for (const [stepId, stepData] of Object.entries(oldMenu.steps)) {
      let text = "";

      if (typeof stepData === "string") {
        text = stepData;
      } else if (stepData.header && stepData.options) {
        text = `${stepData.header}\n\n${stepData.options.join("\n")}`;
      } else {
        text = stepData.message || "Opção indisponível";
      }

      const routes = [];

      if (stepId === "MENU_INICIAL") {
        routes.push({ match: ["1"], action: { type: "GOTO", to: "PLANOS" } });
        routes.push({ match: ["2"], action: { type: "TEXT", text: oldMenu.texts?.comoFuncionaPlaceholder || "✅ Como funciona" } });
        routes.push({ match: ["3"], action: { type: "HANDOFF" } });
        routes.push({ match: ["9", "menu"], action: { type: "BACK" } });
        routes.push({ match: ["0"], action: { type: "END", text: oldMenu.texts?.encerrado || "✅ Encerrado" } });
      } else if (stepId === "PLANOS") {
        routes.push({ match: ["1"], action: { type: "TEXT", text: oldMenu.texts?.planosBasico || "✅ Plano Básico" } });
        routes.push({ match: ["2"], action: { type: "TEXT", text: oldMenu.texts?.planosPro || "✅ Plano Pro" } });
        routes.push({ match: ["9", "voltar"], action: { type: "BACK" } });
        routes.push({ match: ["0"], action: { type: "END", text: oldMenu.texts?.encerrado || "✅ Encerrado" } });
        routes.push({ match: ["menu"], action: { type: "BACK" } });
      }

      newMenu.steps[stepId] = { text, routes, fallback: { type: "TEXT", text: "⚠️ Opção inválida. Tente novamente." } };
    }
  }

  return newMenu;
}

/**
 * Obter step do menu configurável
 */
function getStep(menu, stepId) {
  if (!menu || !menu.steps) return null;
  return menu.steps[stepId] || null;
}

/**
 * Normalizar entrada do usuário
 */
function normalizeInput(input) {
  return (input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function validateMenuSchema(menu) {
  if (!menu || typeof menu !== "object") {
    return { valid: false, error: "menu deve ser um objeto" };
  }

  if (!menu.steps || typeof menu.steps !== "object") {
    return { valid: false, error: "menu.steps deve ser um objeto" };
  }

  if (!menu.steps.MENU_INICIAL) {
    return { valid: false, error: "menu.steps.MENU_INICIAL é obrigatório" };
  }

  const validTypes = new Set(["GOTO", "BACK", "END", "TEXT", "HANDOFF"]);

  // Validar globals.aliases
  if (menu.globals?.aliases) {
    if (!Array.isArray(menu.globals.aliases)) {
      return { valid: false, error: "globals.aliases deve ser um array" };
    }

    for (let i = 0; i < menu.globals.aliases.length; i++) {
      const alias = menu.globals.aliases[i];
      if (!alias || typeof alias !== "object") {
        return { valid: false, error: `alias inválido em globals.aliases[${i}]` };
      }

      if (!Array.isArray(alias.match) || alias.match.length === 0) {
        return { valid: false, error: `alias.match deve ser array não vazio em globals.aliases[${i}]` };
      }

      if (!alias.action || typeof alias.action !== "object") {
        return { valid: false, error: `alias.action inválida em globals.aliases[${i}]` };
      }

      if (!validTypes.has(alias.action.type)) {
        return { valid: false, error: `alias.action.type inválido em globals.aliases[${i}]` };
      }

      if (alias.action.type === "GOTO") {
        if (!alias.action.to || typeof alias.action.to !== "string") {
          return { valid: false, error: `alias.action.to obrigatório em GOTO (globals.aliases[${i}])` };
        }
        if (!menu.steps[alias.action.to]) {
          return { valid: false, error: `alias.action.to não existe: ${alias.action.to}` };
        }
      }

      if (alias.action.type === "TEXT") {
        if (typeof alias.action.text !== "string") {
          return { valid: false, error: `alias.action.text obrigatório em TEXT (globals.aliases[${i}])` };
        }
      }
    }
  }

  for (const [stepId, step] of Object.entries(menu.steps)) {
    if (!step || typeof step !== "object") {
      return { valid: false, error: `step inválido: ${stepId}` };
    }

    if (!Array.isArray(step.routes)) {
      return { valid: false, error: `menu.steps.${stepId}.routes deve ser um array` };
    }

    for (const route of step.routes) {
      if (!route || typeof route !== "object") {
        return { valid: false, error: `route inválida em ${stepId}` };
      }

      if (!Array.isArray(route.match) || route.match.length === 0) {
        return { valid: false, error: `route.match deve ser array não vazio em ${stepId}` };
      }

      if (!route.action || typeof route.action !== "object") {
        return { valid: false, error: `route.action inválida em ${stepId}` };
      }

      if (!validTypes.has(route.action.type)) {
        return { valid: false, error: `action.type inválido em ${stepId}` };
      }

      if (route.action.type === "GOTO") {
        if (!route.action.to || typeof route.action.to !== "string") {
          return { valid: false, error: `action.to obrigatório em GOTO (${stepId})` };
        }
        if (!menu.steps[route.action.to]) {
          return { valid: false, error: `action.to não existe: ${route.action.to}` };
        }
      }

      if (route.action.type === "TEXT") {
        if (typeof route.action.text !== "string") {
          return { valid: false, error: `route.action.text obrigatório em TEXT (${stepId})` };
        }
      }
    }

    if (step.fallback) {
      if (!step.fallback.type || !validTypes.has(step.fallback.type)) {
        return { valid: false, error: `fallback.type inválido em ${stepId}` };
      }
      if (step.fallback.type === "GOTO") {
        if (!step.fallback.to || typeof step.fallback.to !== "string") {
          return { valid: false, error: `fallback.to obrigatório em GOTO (${stepId})` };
        }
        if (!menu.steps[step.fallback.to]) {
          return { valid: false, error: `fallback.to não existe: ${step.fallback.to}` };
        }
      }
      if (step.fallback.type === "TEXT") {
        if (typeof step.fallback.text !== "string") {
          return { valid: false, error: `fallback.text obrigatório em TEXT (${stepId})` };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Resolver rota baseada no input do usuário
 */
function resolveRoute(step, input) {
  if (!step || !Array.isArray(step.routes)) return null;

  const normalizedInput = normalizeInput(input);

  for (const route of step.routes) {
    const matches = Array.isArray(route?.match) ? route.match : [];
    for (const m of matches) {
      if (normalizeInput(m) === normalizedInput) {
        return route;
      }
    }
  }

  return null;
}

/**
 * Renderizar mensagem de um step
 */
function renderStep(step) {
  if (!step) return "Menu indisponível";
  return step.text || "Opção indisponível";
}

/**
 * Executar ação do fluxo
 */
async function executeAction(action, session, client, chatId, tenantId, menu) {
  const actionType = action?.type;
  
  console.log("[FLOW] Executando ação:", actionType, "chatId=", chatId, "currentStep=", session.step);
  
  switch (actionType) {
    case "GOTO": {
      if (!action.to) {
        console.warn("[FLOW] GOTO sem action.to");
        break;
      }
      // Empilhar step atual e ir para novo step
      if (!session.stack) session.stack = [];
      session.stack.push(session.step);
      session.step = action.to;
      
      const nextStep = getStep(menu, action.to);
      if (nextStep) {
        await client.sendMessage(chatId, renderStep(nextStep));
        console.log("[FLOW] GOTO:", action.to, "stack=", session.stack.join(" > "));
      } else {
        console.warn("[FLOW] GOTO step não encontrado:", action.to);
      }
      break;
    }
    
    case "BACK": {
      // Voltar ao step anterior no stack
      if (!session.stack) session.stack = [];
      
      const previousStep = session.stack.pop();
      const targetStep = previousStep || "MENU_INICIAL";
      session.step = targetStep;
      
      const step = getStep(menu, targetStep);
      if (step) {
        await client.sendMessage(chatId, renderStep(step));
        console.log("[FLOW] BACK para:", targetStep, "stack=", session.stack.join(" > "));
      }
      break;
    }

    case "TEXT": {
      // Responder sem mudar step
      if (action.text) {
        await client.sendMessage(chatId, action.text);
        console.log("[FLOW] TEXT (step mantido):", session.step);
      }
      break;
    }
    
    case "END": {
      // Finalizar sessão
      if (action.text) {
        await client.sendMessage(chatId, action.text);
      }
      resetSession(tenantId, chatId);
      console.log("[FLOW] END: sessão removida");
      break;
    }

    case "HANDOFF": {
      await client.sendMessage(chatId, "Um atendente falará com você");
      console.log("[FLOW] HANDOFF: placeholder enviado");
      break;
    }
    
    default:
      console.warn("[FLOW] Ação desconhecida:", actionType);
  }
}

const MENU_CONFIG = {
  triggers: ["menu", "#menu", "start"],
  globals: {
    aliases: [
      { match: ["sair", "exit", "quit"], action: { type: "END", text: "✅ Até logo!", resetStack: true } },
      { match: ["home", "início"], action: { type: "BACK", resetStack: true } }
    ]
  },
  steps: {
    MENU_INICIAL: {
      text: "Olá! 👋\nResponda apenas com um número:\n\n1️⃣ Planos\n2️⃣ Como funciona\n3️⃣ Falar com atendente\n\n9️⃣ Repetir menu\n0️⃣ Encerrar",
      routes: [
        { match: ["1"], action: { type: "GOTO", to: "PLANOS" } },
        { match: ["2"], action: { type: "TEXT", text: "✅ Você escolheu: Como funciona (placeholder)" } },
        { match: ["3"], action: { type: "HANDOFF" } },
        { match: ["9", "menu"], action: { type: "BACK" } },
        { match: ["0"], action: { type: "END", text: "✅ Atendimento encerrado. Quando quiser, digite 'menu' novamente." } }
      ],
      fallback: { type: "TEXT", text: "⚠️ Opção inválida. Digite 1, 2, 3, 9 ou 0." }
    },
    PLANOS: {
      text: "📦 *Planos*\nResponda apenas com um número:\n\n1️⃣ Plano Básico\n2️⃣ Plano Pro\n\n9️⃣ Voltar ao menu\n0️⃣ Encerrar",
      routes: [
        { match: ["1"], action: { type: "TEXT", text: "✅ Plano Básico selecionado. (placeholder)" } },
        { match: ["2"], action: { type: "TEXT", text: "✅ Plano Pro selecionado. (placeholder)" } },
        { match: ["9", "voltar"], action: { type: "BACK" } },
        { match: ["0"], action: { type: "END", text: "✅ Atendimento encerrado. Quando quiser, digite 'menu' novamente." } }
      ],
      fallback: { type: "TEXT", text: "⚠️ Opção inválida. Digite 1, 2, 9 ou 0." }
    }
  }
};
console.log("[CONFIG] MENU_CONFIG carregado. Triggers:", MENU_CONFIG.triggers.join(", "));

// Defaults para regras e settings
const RULES_DEFAULT = [];
const SETTINGS_DEFAULT = {
  defaultMessage: "👋 Olá! Em breve retornamos em contato.",
  windowSeconds: 24 * 60 * 60
};

// Função para limpar mensagens processadas após timeout
function addProcessedMessage(msgId) {
  processedMessages.add(msgId);
  setTimeout(() => {
    processedMessages.delete(msgId);
  }, DUPLICATE_TIMEOUT);
}

/**
 * Handler genérico de fluxo de menu usando engine configurável
 */
async function handleMenuFlow(client, tenantId, chatId, body, session, config) {
  console.log("[MENU] Entrada recebida:", chatId, "body=", body, "step=", session.step);
  
  // Adaptar menu para novo formato se necessário
  const menu = adaptLegacyMenuFormat(config);
  if (!menu) {
    console.error("[MENU] Menu inválido para tenant:", tenantId);
    await client.sendMessage(chatId, "Menu temporariamente indisponível.");
    return;
  }
  
  // Obter step atual
  const currentStep = getStep(menu, session.step);
  if (!currentStep) {
    console.warn("[MENU] Step não encontrado:", session.step, "- resetando para MENU_INICIAL");
    session.step = "MENU_INICIAL";
    session.stack = [];
    const homeStep = getStep(menu, session.step);
    if (homeStep) {
      await client.sendMessage(chatId, renderStep(homeStep));
    }
    return;
  }
  
  const normalizedInput = normalizeInput(body);
  
  // 1) Checar globals.aliases
  if (menu.globals?.aliases) {
    for (const alias of menu.globals.aliases) {
      const matches = Array.isArray(alias?.match) ? alias.match : [];
      for (const m of matches) {
        if (normalizeInput(m) === normalizedInput) {
          const action = alias.action;
          const fromStep = session.step;
          let toStep = null;

          if (action.type === "GOTO") {
            toStep = action.to || null;
          } else if (action.type === "BACK") {
            const previousStep = session.stack?.[session.stack.length - 1] || "MENU_INICIAL";
            toStep = previousStep;
          }

          if (action.resetStack) {
            session.stack = [];
          }

          console.log("[ENGINE] matched via=alias",
            "action=", action.type,
            "fromStep=", fromStep,
            "toStep=", toStep,
            "stackLen=", session.stack?.length || 0
          );

          await executeAction(action, session, client, chatId, tenantId, menu);
          return;
        }
      }
    }
  }
  
  // 2) Checar routes do step atual
  const route = resolveRoute(currentStep, body);
  
  if (route?.action) {
    const action = route.action;
    const fromStep = session.step;
    let toStep = null;

    if (action.type === "GOTO") {
      toStep = action.to || null;
    } else if (action.type === "BACK") {
      const previousStep = session.stack?.[session.stack.length - 1] || "MENU_INICIAL";
      toStep = previousStep;
    }

    console.log("[ENGINE] matched via=route",
      "action=", action.type,
      "fromStep=", fromStep,
      "toStep=", toStep,
      "stackLen=", session.stack?.length || 0
    );

    await executeAction(action, session, client, chatId, tenantId, menu);
    return;
  }

  // 3) Executar fallback do step
  if (currentStep.fallback) {
    console.log("[ENGINE] matched via=fallback",
      "action=", currentStep.fallback.type,
      "fromStep=", session.step,
      "stackLen=", session.stack?.length || 0
    );
    await executeAction(currentStep.fallback, session, client, chatId, tenantId, menu);
    return;
  }

  // 4) Fallback final: settings.defaultMessage
  const settings = getTenantConfig(tenantId)?.__settings || SETTINGS_DEFAULT;
  const defaultMessage = settings?.defaultMessage?.trim();

  if (defaultMessage) {
    console.log("[ENGINE] matched via=default",
      "fromStep=", session.step,
      "stackLen=", session.stack?.length || 0
    );
    await client.sendMessage(chatId, defaultMessage);
    return;
  }

  console.log("[MENU] Nenhuma rota, fallback ou default:", body, "step=", session.step);
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
      stack: [],
      data: {},
      lastMessageAt: Date.now()
    };
    sessions.set(sessionKey, session);
    console.log(`[SESSION] Nova sessão criada:`, sessionKey);
    console.log("[SESSION] Key:", sessionKey, "step=", session.step, "stack=", session.stack.length);
    return session;
  }

  // Se existir, verificar expiração
  const elapsed = Date.now() - session.lastMessageAt;
  if (elapsed > SESSION_TTL_MS) {
    console.log(`[SESSION] Sessão expirada, resetando:`, sessionKey);
    session.step = "MENU_INICIAL";
    session.stack = [];
    session.data = {};
    session.lastMessageAt = Date.now();
    console.log("[SESSION] Key:", sessionKey, "step=", session.step, "stack=", session.stack.length);
    return session;
  }

  // Atualizar lastMessageAt
  session.lastMessageAt = Date.now();
  console.log("[SESSION] Key:", sessionKey, "step=", session.step, "stack=", session.stack.length);
  return session;
}

function resetSession(tenantId, chatId) {
  const sessionKey = `${tenantId}:${chatId}`;
  sessions.delete(sessionKey);
  console.log(`[SESSION] Sessão removida:`, sessionKey);
}

// =====================================
// FUNÇÕES DE DEBUG: SESSIONS
// =====================================
function getSessionsByTenantId(tenantId) {
  const result = [];
  
  for (const [sessionKey, session] of sessions.entries()) {
    // sessionKey formato: "tenantId:chatId"
    const [keyTenantId, chatId] = sessionKey.split(":");
    
    if (keyTenantId === tenantId) {
      result.push({
        chatId,
        step: session.step || "MENU_INICIAL",
        stack: session.stack || [],
        mode: session.mode || null,
        lastMessageAt: session.lastMessageAt || null,
        updatedAt: new Date(session.lastMessageAt || Date.now()).toISOString()
      });
    }
  }
  
  return result;
}

function clearSessionsByTenantId(tenantId) {
  let cleared = 0;
  const keysToDelete = [];
  
  for (const [sessionKey] of sessions.entries()) {
    // sessionKey formato: "tenantId:chatId"
    const [keyTenantId] = sessionKey.split(":");
    
    if (keyTenantId === tenantId) {
      keysToDelete.push(sessionKey);
    }
  }
  
  for (const sessionKey of keysToDelete) {
    sessions.delete(sessionKey);
    cleared++;
  }
  
  console.log(`[SESSION] Removidas ${cleared} sessões do tenantId:`, tenantId);
  return cleared;
}

// Status messages
const statusMessages = {
  waiting_qr: "Aguardando QR code",
  authenticated: "Autenticado",
  ready: "Pronto",
  disconnected: "Desconectado"
};

// =====================================
// CONFIGURAÇÃO DO CLIENTE WHATSAPP (REMOVIDO - AGORA É POR TENANT)
// =====================================
/*
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    timeout: 60000,
  },
  webVersion: "2.3000.1032180192-alpha",
  webVersionCache: {
    type: "remote",
    remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html",
    strict: false,
  },
});
*/

/*
// =====================================
// CLIENTE GLOBAL ANTIGO - REMOVIDO (AGORA É POR TENANT)
// =====================================
// Todo código abaixo foi migrado para getOrCreateClientForTenant()
// Cada tenant tem seu próprio client em CLIENTS_MAP

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
*/

/*
// =====================================
// CLIENTE GLOBAL ANTIGO - ATIVO MAS OBSOLETO (USAR attachBotHandlers INSTEAD)
// =====================================
// Todos esses handlers são ATIVO mas NÃO DEVEM SER USADOS
// O código agora é per-tenant em attachBotHandlers(client, tenantId)
// Deixar comentado para evitar conflitos com tenants

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

*/

// =====================================
// SOCKET.IO: CONEXÃO DO CLIENTE
// =====================================
io.on("connection", async (socket) => {
  let token = socket.handshake.query?.token;
  
  // Normalizar token
  token = normalizeToken(token);
  
  // Validar presença de token
  if (!token || token.length < 5) {
    console.log("[SOCKET] ❌ connect sem token válido, id=", socket.id, "query=", socket.handshake.query);
    socket.disconnect(true);
    return;
  }

  // Resolver tenant pelo token
  const tenant = await getOrCreateTenantByToken(token);
  if (!tenant || tenant.error) {
    console.log("[SOCKET] ❌ token inválido", token, "socket=", socket.id);
    socket.disconnect(true);
    return;
  }

  // Entrar na sala do tenant (ISOLAMENTO)
  socket.join(tenant.tenantId);
  console.log("[SOCKET] ✅ socket joined tenant", tenant.tenantId, "socket=", socket.id, "token=", token);

  // Enviar status/QR se já existir client cached
  const cached = CLIENTS_MAP.get(tenant.tenantId);
  if (cached) {
    if (cached.qrDataUrl) {
      console.log("[SOCKET] enviando QR cached para tenant", tenant.tenantId);
      socket.emit("qr", cached.qrDataUrl);
    }
    if (cached.status) {
      console.log("[SOCKET] enviando status cached para tenant", tenant.tenantId, "status=", cached.status);
      socket.emit("status", cached.status);
    }
  }

  socket.on("disconnect", () => {
    console.log("🌐 Cliente desconectado:", socket.id, "tenant=", tenant.tenantId);
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

app.get("/t/:token", async (req, res) => {
  try {
    const result = await getTenantFromRequest(req);
    if (result.error) {
      return res.status(result.statusCode || 400).json(result);
    }
    
    // result.token contém o token do request
    const tenant = await getOrCreateTenantByToken(result.token);
    if (!tenant) {
      return res.status(400).json({ error: "Falha ao criar/carregar tenant" });
    }
    
    console.log("[ROUTE] /t/:token opened tenantId=", tenant.tenantId);
    
    // Garantir que o client foi iniciado
    await getOrCreateClientForTenant(tenant);
    
    res.sendFile(path.join(__dirname, "web", "index.html"));
  } catch (err) {
    console.error("❌ Erro na rota /t/:token:", err.message, err.stack);
    res.status(500).send("Erro ao carregar página");
  }
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
// Handler GET config (runtime em memória)
const getConfigHandler = async (req, res) => {
  try {
    const result = await getTenantFromRequest(req);
    if (result.error) {
      return res.status(result.statusCode || 400).json(result);
    }
    const tenant = await getOrCreateTenantByToken(result.token);
    console.log("[API] GET config (runtime):", tenant.tenantId);
    res.json(tenant.config);
  } catch (err) {
    console.error("❌ Erro ao obter config:", err.message);
    res.status(500).json({ error: "Erro ao obter config" });
  }
};

// Handler GET config (DB)
const getConfigDbHandler = async (req, res) => {
  try {
    const result = await getTenantFromRequest(req);
    if (result.error) {
      return res.status(result.statusCode || 400).json(result);
    }
    const tenant = await getOrCreateTenantByToken(result.token);
    const dbConfig = dbGetConfigByTenantId(tenant.tenantId);
    console.log("[API] GET config (DB):", tenant.tenantId);
    res.json(dbConfig);
  } catch (err) {
    console.error("❌ Erro ao obter config DB:", err.message);
    res.status(500).json({ error: "Erro ao obter config DB" });
  }
};

// Rotas GET config
app.get("/t/:token/config", getConfigHandler);
app.get("/api/t/:token/config", getConfigDbHandler);

// Handler PUT config (aceita novo e legado)
const putConfigHandler = async (req, res) => {
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

    // Normalizar body (novo ou legado)
    let menu = body.menu ? body.menu : Object.assign({}, body);
    if (!body.menu) {
      delete menu.__rules;
      delete menu.__settings;
    }
    const rules = body.rules || body.__rules || [];
    const settings = body.settings || body.__settings || SETTINGS_DEFAULT;

    const menuValidation = validateMenuSchema(menu);
    if (!menuValidation.valid) {
      return res.status(400).json({ error: menuValidation.error });
    }

    await dbUpsertConfigByTenantId(tenant.tenantId, menu, rules, settings);

    // Atualizar runtime
    tenant.config = Object.assign({}, menu, { __rules: rules, __settings: settings });

    console.log("[API] PUT config:", tenant.tenantId);
    console.log("[CONFIG] Runtime atualizado para tenant:", tenant.tenantId);
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Erro ao atualizar config:", err.message);
    res.status(500).json({ error: "Erro ao atualizar config" });
  }
};

// Rotas PUT config (original + alias)
app.put("/t/:token/config", putConfigHandler);
app.put("/api/t/:token/config", putConfigHandler);

// =====================================
// API REST: SALVAR CONFIG ESTRUTURADA POR TENANT
// =====================================
app.post("/api/t/:token/config", async (req, res) => {
  try {
    let { token } = req.params;
    token = normalizeToken(token);
    
    if (!token || token.length < 5) {
      return res.status(400).json({ error: "Token inválido ou ausente" });
    }

    const { menu, rules, settings } = req.body;
    
    // Validações
    if (!menu || typeof menu !== "object") {
      return res.status(400).json({ error: "menu deve ser um objeto" });
    }
    if (!Array.isArray(rules)) {
      return res.status(400).json({ error: "rules deve ser um array" });
    }
    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "settings deve ser um objeto" });
    }
    if (!settings.defaultMessage || typeof settings.defaultMessage !== "string") {
      return res.status(400).json({ error: "settings.defaultMessage deve ser string" });
    }
    if (typeof settings.windowSeconds !== "number") {
      return res.status(400).json({ error: "settings.windowSeconds deve ser number" });
    }

    const menuValidation = validateMenuSchema(menu);
    if (!menuValidation.valid) {
      return res.status(400).json({ error: menuValidation.error });
    }

    // Resolver tenant
    const tenant = await getOrCreateTenantByToken(token);
    if (!tenant || tenant.error) {
      return res.status(400).json({ error: "Token inválido" });
    }

    const tenantId = tenant.tenantId;

    // Persistir no DB
    await dbUpsertConfigByTenantId(tenantId, menu, rules, settings);

    console.log("[API] saveConfig token=", token, "tenantId=", tenantId,
      "menu=", !!menu, "rules=", Array.isArray(rules) ? rules.length : 0,
      "settings=", settings?.defaultMessage?.length, settings?.windowSeconds);

    res.json({ ok: true, tenantId });
  } catch (err) {
    console.error("❌ Erro ao salvar config:", err.message);
    res.status(500).json({ error: "Erro ao salvar config" });
  }
});

// =====================================
// API REST: DEBUG - SESSIONS (LIST)
// =====================================
app.get("/api/t/:token/sessions", async (req, res) => {
  try {
    let { token } = req.params;
    token = normalizeToken(token);
    
    // Validar formato do token
    if (!token || token.length < 5) {
      console.warn("[API] token inválido para sessions (formato):", req.params.token);
      return res.status(400).json({ 
        ok: false, 
        error: "TOKEN_INVALID", 
        token: req.params.token,
        message: "Token deve ter no mínimo 5 caracteres"
      });
    }

    // Validar se token existe no banco (NÃO criar automaticamente)
    const rowTenant = db.prepare("SELECT tenant_id FROM tenants WHERE token = ?").get(token);
    
    if (!rowTenant || !rowTenant.tenant_id) {
      console.warn("[API] token inválido para sessions:", token);
      return res.status(404).json({ 
        ok: false, 
        error: "TOKEN_INVALID", 
        token
      });
    }

    const tenantId = rowTenant.tenant_id;
    const sessionsList = getSessionsByTenantId(tenantId);

    console.log("[API] GET sessions:", tenantId, "token=", token, "count=", sessionsList.length);
    res.json({
      tenantId,
      count: sessionsList.length,
      sessions: sessionsList
    });
  } catch (err) {
    console.error("❌ Erro ao listar sessões:", err.message);
    res.status(500).json({ error: "Erro ao listar sessões" });
  }
});

// =====================================
// API REST: DEBUG - SESSIONS (CLEAR)
// =====================================
app.post("/api/t/:token/sessions/clear", async (req, res) => {
  try {
    let { token } = req.params;
    token = normalizeToken(token);
    
    // Validar formato do token
    if (!token || token.length < 5) {
      console.warn("[API] token inválido para sessions/clear (formato):", req.params.token);
      return res.status(400).json({ 
        ok: false, 
        error: "TOKEN_INVALID", 
        token: req.params.token,
        message: "Token deve ter no mínimo 5 caracteres"
      });
    }

    // Validar se token existe no banco (NÃO criar automaticamente)
    const rowTenant = db.prepare("SELECT tenant_id FROM tenants WHERE token = ?").get(token);
    
    if (!rowTenant || !rowTenant.tenant_id) {
      console.warn("[API] token inválido para sessions/clear:", token);
      return res.status(404).json({ 
        ok: false, 
        error: "TOKEN_INVALID", 
        token
      });
    }

    const tenantId = rowTenant.tenant_id;
    const cleared = clearSessionsByTenantId(tenantId);

    console.log("[API] CLEAR sessions:", tenantId, "token=", token, "cleared=", cleared);
    res.json({
      ok: true,
      tenantId,
      cleared
    });
  } catch (err) {
    console.error("❌ Erro ao limpar sessões:", err.message);
    res.status(500).json({ error: "Erro ao limpar sessões" });
  }
});

// =====================================
// API REST: DEBUG - ENGINE SIMULATION
// =====================================
app.post("/api/t/:token/engine/simulate", async (req, res) => {
  try {
    let { token } = req.params;
    token = normalizeToken(token);
    
    if (!token || token.length < 5) {
      return res.status(400).json({ error: "Token inválido" });
    }

    const tenant = await getOrCreateTenantByToken(token);
    if (!tenant) {
      return res.status(400).json({ error: "Tenant inválido" });
    }

    const { input, chatId = "simulate@c.us", mode = "MENU" } = req.body;
    if (!input || typeof input !== "string") {
      return res.status(400).json({ error: "input é obrigatório e deve ser string" });
    }

    // Criar ou recuperar sessão de simulação
    const sessionKey = `${tenant.tenantId}:${chatId}`;
    let session = sessions.get(sessionKey);
    if (!session) {
      session = { step: "MENU_INICIAL", stack: [], data: {}, lastMessageAt: Date.now(), mode: "MENU" };
      sessions.set(sessionKey, session);
    }

    const tenantConfig = getTenantConfig(tenant.tenantId);
    const menu = adaptLegacyMenuFormat(tenantConfig);
    if (!menu) {
      return res.status(400).json({ error: "Menu inválido para tenant" });
    }

    const normalizedInput = normalizeInput(input);
    const stackBefore = [...(session.stack || [])];
    let matched = false;
    let via = null;
    let action = null;
    let fromStep = session.step;
    let toStep = null;

    // 1) Checar globals.aliases
    if (menu.globals?.aliases) {
      for (const alias of menu.globals.aliases) {
        const matches = Array.isArray(alias?.match) ? alias.match : [];
        for (const m of matches) {
          if (normalizeInput(m) === normalizedInput) {
            matched = true;
            via = "alias";
            action = alias.action;

            if (action.type === "GOTO") {
              toStep = action.to;
            } else if (action.type === "BACK") {
              toStep = session.stack?.[session.stack.length - 1] || "MENU_INICIAL";
            }

            if (action.resetStack) {
              session.stack = [];
            }

            console.log("[ENGINE/SIM] matched via=alias action=", action.type);
            break;
          }
        }
        if (matched) break;
      }
    }

    // 2) Checar routes do step atual
    if (!matched) {
      const currentStep = getStep(menu, session.step);
      if (currentStep) {
        const route = resolveRoute(currentStep, input);
        if (route?.action) {
          matched = true;
          via = "route";
          action = route.action;

          if (action.type === "GOTO") {
            toStep = action.to;
          } else if (action.type === "BACK") {
            toStep = session.stack?.[session.stack.length - 1] || "MENU_INICIAL";
          }

          console.log("[ENGINE/SIM] matched via=route action=", action.type);
        }
      }
    }

    // 3) Checar fallback
    if (!matched) {
      const currentStep = getStep(menu, session.step);
      if (currentStep?.fallback) {
        matched = true;
        via = "fallback";
        action = currentStep.fallback;

        if (action.type === "GOTO") {
          toStep = action.to;
        } else if (action.type === "BACK") {
          toStep = session.stack?.[session.stack.length - 1] || "MENU_INICIAL";
        }

        console.log("[ENGINE/SIM] matched via=fallback action=", action.type);
      }
    }

    // 4) Checar default
    if (!matched) {
      const settings = tenantConfig?.__settings || SETTINGS_DEFAULT;
      if (settings?.defaultMessage) {
        matched = true;
        via = "default";
        console.log("[ENGINE/SIM] matched via=default");
      }
    }

    // Simular execução da ação sem enviar mensagens
    if (action?.type === "GOTO" && action.to) {
      if (!session.stack) session.stack = [];
      session.stack.push(session.step);
      session.step = action.to;
      toStep = action.to;
    } else if (action?.type === "BACK") {
      const previousStep = session.stack?.pop();
      session.step = previousStep || "MENU_INICIAL";
      toStep = session.step;
    } else if (action?.type === "END") {
      sessions.delete(sessionKey);
    }

    const stackAfter = [...(session.stack || [])];

    res.json({
      matched,
      via,
      action: action ? { type: action.type, to: action.to, text: action.text ? "..." : undefined } : null,
      fromStep,
      toStep,
      stackBefore,
      stackAfter,
      sessionClosed: !sessions.has(sessionKey)
    });
  } catch (err) {
    console.error("❌ Erro na simulação:", err.message);
    res.status(500).json({ error: "Erro na simulação", message: err.message });
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
// PROTEÇÃO GLOBAL CONTRA CRASH
// =====================================
process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException", err);
});

process.on("unhandledRejection", (err) => {
  console.error("[FATAL] unhandledRejection", err);
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
  
  // Destruir todos os clients de tenant
  for (const [tenantId, cached] of CLIENTS_MAP.entries()) {
    if (cached.client) {
      console.log("[SHUTDOWN] Destruindo client para tenant:", tenantId);
      try {
        cached.client.destroy();
      } catch (err) {
        console.error("[SHUTDOWN] Erro ao destruir client:", err.message);
      }
    }
  }
  
  // Fechar database
  if (db) {
    console.log("[SHUTDOWN] Fechando database...");
    try {
      db.close();
    } catch (err) {
      console.error("[SHUTDOWN] Erro ao fechar database:", err.message);
    }
  }
  
  // Fechar servidor HTTP
  httpServer.close(() => {
    console.log("✅ Servidor encerrado");
    process.exit(0);
  });
});
