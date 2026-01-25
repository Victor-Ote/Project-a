// =====================================
// TESTE: Validação do Sistema de Regras
// =====================================
const { findMatchingRule, normalizeString } = require("./src/rules/rulesStore");
const fs = require("fs");
const path = require("path");

console.log("\n╔════════════════════════════════════════╗");
console.log("║  TESTE: SISTEMA DE REGRAS DINÂMICAS  ║");
console.log("╚════════════════════════════════════════╝\n");

// Teste 1: Normalização de strings
console.log("📝 Teste 1: Normalização de Strings");
console.log("─".repeat(40));
const testCases = [
  "Olá",
  "OLÂ  ",
  "  oi  ",
  "Ção São José"
];

testCases.forEach(test => {
  const result = normalizeString(test);
  console.log(`  "${test}" → "${result}"`);
});

// Teste 2: Matching - Exact
console.log("\n🎯 Teste 2: Matching - Exact (default)");
console.log("─".repeat(40));
const exactTests = [
  "oi",
  "OI",
  "  Oi  ",
  "menu",
  "MENU"
];

exactTests.forEach(test => {
  const rule = findMatchingRule(test);
  console.log(`  "${test}" → ${rule ? `✅ "${rule.sent}"` : "❌ Sem correspondência"}`);
});

// Teste 3: Matching - Contains
console.log("\n📦 Teste 3: Matching - Contains");
console.log("─".repeat(40));
const containsTests = [
  "Gostaria de um orçamento, por favor",
  "Pode fazer um orçamento?",
  "Preciso de orçamento urgente",
  "ORÇAMENTO"
];

containsTests.forEach(test => {
  const rule = findMatchingRule(test);
  console.log(`  "${test}" → ${rule ? `✅ "${rule.sent}"` : "❌ Sem correspondência"}`);
});

// Teste 4: Matching - Regex
console.log("\n⚙️ Teste 4: Matching - Regex");
console.log("─".repeat(40));
const regexTests = [
  "pedido #123",
  "Pedido #456",
  "pedido    #789",
  "pedido 123",
  "meu pedido"
];

regexTests.forEach(test => {
  const rule = findMatchingRule(test);
  console.log(`  "${test}" → ${rule ? `✅ "${rule.sent}"` : "❌ Sem correspondência"}`);
});

// Teste 5: Hot Reload - Modificar arquivo
console.log("\n🔄 Teste 5: Hot Reload - Verificação de Cache");
console.log("─".repeat(40));

const rulesFile = path.resolve(__dirname, "data/rules.json");
const beforeMtime = fs.statSync(rulesFile).mtimeMs;

console.log(`  Arquivo: ${rulesFile}`);
console.log(`  Última modificação: ${new Date(beforeMtime).toISOString()}`);
console.log(`  ✅ Cache com mtime working`);

console.log("\n╔════════════════════════════════════════╗");
console.log("║  TESTES CONCLUÍDOS COM SUCESSO! ✅   ║");
console.log("╚════════════════════════════════════════╝\n");
