const fs = require("fs");
const path = require("path");

// =====================================
// CONFIGURAÇÃO
// =====================================
const STATE_FILE = path.resolve(__dirname, "../../data/contact_state.json");

let stateData = {}; // { "551199999999@c.us": { lastActivityAt, lastDefaultSentAt } }
let saveTimeout = null;
const SAVE_DEBOUNCE_MS = 2000; // 2 segundos

// =====================================
// FUNÇÃO: CARREGAR STATE DO DISCO
// =====================================
function loadStateSync() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      stateData = {};
      return;
    }

    const data = fs.readFileSync(STATE_FILE, "utf-8");
    stateData = JSON.parse(data);
    console.log(`✅ Contact state carregado: ${Object.keys(stateData).length} contato(s)`);
  } catch (err) {
    console.error("❌ Erro ao carregar contact_state.json:", err.message);
    stateData = {};
  }
}

// =====================================
// FUNÇÃO: SALVAR STATE NO DISCO (DEBOUNCED)
// =====================================
function persistState() {
  // Cancelar salvamento anterior se existir
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  // Agendar salvamento
  saveTimeout = setTimeout(() => {
    try {
      const dir = path.dirname(STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(STATE_FILE, JSON.stringify(stateData, null, 2));
      console.log(`💾 Contact state persistido: ${Object.keys(stateData).length} contato(s)`);
    } catch (err) {
      console.error("❌ Erro ao salvar contact_state.json:", err.message);
    }
  }, SAVE_DEBOUNCE_MS);
}

// =====================================
// FUNÇÃO: OBTER STATE DE UM CONTATO
// =====================================
function getContactState(contactId) {
  if (!stateData[contactId]) {
    return {
      lastActivityAt: 0,
      lastDefaultSentAt: 0
    };
  }
  return stateData[contactId];
}

// =====================================
// FUNÇÃO: ATUALIZAR STATE DE UM CONTATO
// =====================================
function updateContactState(contactId, patch) {
  if (!stateData[contactId]) {
    stateData[contactId] = {
      lastActivityAt: 0,
      lastDefaultSentAt: 0
    };
  }

  // Aplicar patch
  Object.assign(stateData[contactId], patch);

  // Agendar persistência
  persistState();
}

// =====================================
// FUNÇÃO: MARCAR ATIVIDADE
// =====================================
function markActivity(contactId) {
  const now = Math.floor(Date.now() / 1000); // UNIX seconds
  updateContactState(contactId, { lastActivityAt: now });
}

// =====================================
// FUNÇÃO: MARCAR DEFAULT ENVIADO
// =====================================
function markDefaultSent(contactId) {
  const now = Math.floor(Date.now() / 1000); // UNIX seconds
  updateContactState(contactId, { 
    lastDefaultSentAt: now,
    lastActivityAt: now // Enviar mensagem também conta como atividade
  });
}

// =====================================
// INICIALIZAÇÃO
// =====================================
loadStateSync();

// =====================================
// EXPORTS
// =====================================
module.exports = {
  getContactState,
  updateContactState,
  markActivity,
  markDefaultSent
};
