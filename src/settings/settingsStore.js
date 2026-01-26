const fs = require("fs");
const path = require("path");

// =====================================
// CONFIGURAÇÃO
// =====================================
const SETTINGS_FILE = path.resolve(__dirname, "../../data/settings.json");

let cachedSettings = { defaultMessage: "" };
let lastMtime = null;

// =====================================
// FUNÇÃO: CARREGAR SETTINGS COM CACHE
// =====================================
function getSettingsSync() {
  try {
    // Verificar se arquivo existe
    if (!fs.existsSync(SETTINGS_FILE)) {
      cachedSettings = { defaultMessage: "" };
      lastMtime = null;
      return cachedSettings;
    }

    // Obter metadados do arquivo
    const stats = fs.statSync(SETTINGS_FILE);
    const currentMtime = stats.mtimeMs;

    // Se arquivo não mudou, retornar cache
    if (lastMtime === currentMtime) {
      return cachedSettings;
    }

    // Ler e parsear arquivo
    const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const settings = JSON.parse(data);

    // Validar estrutura
    if (typeof settings.defaultMessage !== "string") {
      console.warn("⚠️ settings.json inválido, usando default");
      return cachedSettings;
    }

    // Atualizar cache
    cachedSettings = settings;
    lastMtime = currentMtime;

    console.log(`✅ Settings recarregado: defaultMessage = ${settings.defaultMessage.length} caracteres`);
    return cachedSettings;
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error("❌ Erro ao parsear settings.json:", err.message);
    } else {
      console.error("❌ Erro ao carregar settings.json:", err.message);
    }
    // Retornar cache anterior se erro
    return cachedSettings;
  }
}

// =====================================
// FUNÇÃO: SALVAR SETTINGS
// =====================================
function saveSettingsSync(settings) {
  try {
    // Validar
    if (typeof settings.defaultMessage !== "string") {
      throw new Error("defaultMessage deve ser string");
    }

    // Criar diretório se não existir
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Salvar
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

    // Atualizar cache
    cachedSettings = settings;
    lastMtime = fs.statSync(SETTINGS_FILE).mtimeMs;

    console.log(`✅ Settings salvo: defaultMessage = ${settings.defaultMessage.length} caracteres`);
    return true;
  } catch (err) {
    console.error("❌ Erro ao salvar settings.json:", err.message);
    return false;
  }
}

// =====================================
// EXPORTS
// =====================================
module.exports = {
  getSettingsSync,
  saveSettingsSync
};
