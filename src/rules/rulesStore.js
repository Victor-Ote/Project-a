const fs = require("fs");
const path = require("path");

// =====================================
// CONFIGURAÇÃO
// =====================================
const RULES_FILE = path.resolve(__dirname, "../../data/rules.json");

let cachedRules = [];
let lastMtime = null;

// =====================================
// NORMALIZAÇÃO DE STRINGS
// =====================================
function normalizeString(str) {
  if (!str) return "";

  // Remove acentos
  const normalized = str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Remove diacríticos

  // Trim + lowercase + collapse múltiplos espaços
  return normalized
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// =====================================
// FUNÇÃO: CARREGAR RULES COM CACHE
// =====================================
function getRulesSync() {
  try {
    // Verificar se arquivo existe
    if (!fs.existsSync(RULES_FILE)) {
      cachedRules = [];
      lastMtime = null;
      return [];
    }

    // Obter metadados do arquivo
    const stats = fs.statSync(RULES_FILE);
    const currentMtime = stats.mtimeMs;

    // Se arquivo não mudou, retornar cache
    if (lastMtime === currentMtime && cachedRules.length > 0) {
      return cachedRules;
    }

    // Ler e parsear arquivo
    const data = fs.readFileSync(RULES_FILE, "utf-8");
    const rules = JSON.parse(data);

    // Validar que é array
    if (!Array.isArray(rules)) {
      console.warn("⚠️ rules.json não é um array, usando []");
      return [];
    }

    // Atualizar cache
    cachedRules = rules;
    lastMtime = currentMtime;

    console.log(`✅ Regras recarregadas: ${rules.length} regra(s)`);
    return rules;
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error("❌ Erro ao parsear rules.json:", err.message);
    } else {
      console.error("❌ Erro ao carregar rules.json:", err.message);
    }
    // Retornar cache anterior se erro de parse
    return cachedRules;
  }
}

// =====================================
// FUNÇÃO: ENCONTRAR REGRA CORRESPONDENTE
// =====================================
function findMatchingRule(messageBody) {
  const rules = getRulesSync();

  if (rules.length === 0) {
    return null;
  }

  const messageNormalized = normalizeString(messageBody);

  for (const rule of rules) {
    const triggerText = rule.received || "";

    // Tipo 1: Regex (regex:pattern)
    if (triggerText.toLowerCase().startsWith("regex:")) {
      const pattern = triggerText.slice(6).trim();
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(messageBody)) {
          console.log(`✅ Regra correspondida [regex]: "${triggerText}"`);
          return rule;
        }
      } catch (err) {
        console.warn(`⚠️ Erro em regex "${pattern}":`, err.message);
      }
      continue;
    }

    // Tipo 2: Contains (contains:text)
    if (triggerText.toLowerCase().startsWith("contains:")) {
      const searchText = triggerText.slice(9).trim();
      const searchNormalized = normalizeString(searchText);
      if (messageNormalized.includes(searchNormalized)) {
        console.log(`✅ Regra correspondida [contains]: "${triggerText}"`);
        return rule;
      }
      continue;
    }

    // Tipo 3: Exact match (default)
    const triggerNormalized = normalizeString(triggerText);
    if (messageNormalized === triggerNormalized) {
      console.log(`✅ Regra correspondida [exact]: "${triggerText}"`);
      return rule;
    }
  }

  return null;
}

// =====================================
// EXPORTS
// =====================================
module.exports = {
  getRulesSync,
  normalizeString,
  findMatchingRule
};
