const fs = require("fs");
const path = require("path");

// =====================================
// CONFIGURAÇÃO
// =====================================
const SETTINGS_FILE = path.resolve(__dirname, "../../data/settings.json");
const DEFAULT_WINDOW_SECONDS = 24 * 60 * 60; // 24 horas
const MIN_WINDOW_SECONDS = 10; // 10 segundos mínimo
const MAX_WINDOW_SECONDS = 7 * 24 * 60 * 60; // 7 dias máximo

let cachedSettings = { 
  defaultMessage: "", 
  defaultWindowSeconds: DEFAULT_WINDOW_SECONDS 
};
let lastMtime = null;

// =====================================
// FUNÇÃO: CARREGAR SETTINGS COM CACHE
// =====================================
function getSettingsSync() {
  try {
    // Verificar se arquivo existe
    if (!fs.existsSync(SETTINGS_FILE)) {
      cachedSettings = { 
        defaultMessage: "", 
        defaultWindowSeconds: DEFAULT_WINDOW_SECONDS 
      };
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

    // Validar windowSeconds
    if (!settings.defaultWindowSeconds) {
      settings.defaultWindowSeconds = DEFAULT_WINDOW_SECONDS;
    }

    // Atualizar cache
    cachedSettings = settings;
    lastMtime = currentMtime;

    console.log(`✅ Settings recarregado: defaultMessage = ${settings.defaultMessage.length} caracteres, windowSeconds = ${settings.defaultWindowSeconds}s`);
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

    if (typeof settings.defaultWindowSeconds !== "number" || 
        settings.defaultWindowSeconds < MIN_WINDOW_SECONDS || 
        settings.defaultWindowSeconds > MAX_WINDOW_SECONDS) {
      throw new Error(`defaultWindowSeconds deve estar entre ${MIN_WINDOW_SECONDS}s e ${MAX_WINDOW_SECONDS}s`);
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

    console.log(`✅ Settings salvo: defaultMessage = ${settings.defaultMessage.length} caracteres, windowSeconds = ${settings.defaultWindowSeconds}s`);
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
  saveSettingsSync,
  DEFAULT_WINDOW_SECONDS,
  MIN_WINDOW_SECONDS,
  MAX_WINDOW_SECONDS
};
