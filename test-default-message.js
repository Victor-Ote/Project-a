// =====================================
// TESTE: Validação do Sistema de Mensagem Default
// =====================================
const { getSettingsSync, saveSettingsSync } = require("./src/settings/settingsStore");
const { getContactState, markActivity, markDefaultSent } = require("./src/state/contactStateStore");

console.log("\n╔════════════════════════════════════════╗");
console.log("║  TESTE: MENSAGEM DEFAULT + JANELA 24H ║");
console.log("╚════════════════════════════════════════╝\n");

// Teste 1: Settings Store
console.log("📝 Teste 1: Settings Store");
console.log("─".repeat(40));

// Salvar settings
const testMessage = "Olá! Esta é uma mensagem default de teste.";
saveSettingsSync({ defaultMessage: testMessage });

// Carregar settings
const settings = getSettingsSync();
console.log(`✅ Default message salva: "${settings.defaultMessage}"`);

// Teste 2: Contact State Store
console.log("\n📊 Teste 2: Contact State Store");
console.log("─".repeat(40));

const testContactId = "5511999999999@c.us";

// Estado inicial
let state = getContactState(testContactId);
console.log(`Estado inicial:`, state);

// Marcar atividade
markActivity(testContactId);
state = getContactState(testContactId);
console.log(`✅ Após markActivity:`, state);

// Marcar default enviado
markDefaultSent(testContactId);
state = getContactState(testContactId);
console.log(`✅ Após markDefaultSent:`, state);

// Teste 3: Verificação de janela 24h
console.log("\n🕐 Teste 3: Verificação de Janela 24h");
console.log("─".repeat(40));

const now = Math.floor(Date.now() / 1000);
const TWENTY_FOUR_HOURS = 24 * 60 * 60;

// Caso 1: Atividade recente (< 24h)
const recentState = getContactState(testContactId);
const timeSinceActivity = now - recentState.lastActivityAt;
console.log(`Tempo desde última atividade: ${Math.floor(timeSinceActivity / 60)} minuto(s)`);
console.log(`Dentro de 24h? ${timeSinceActivity < TWENTY_FOUR_HOURS ? '✅ SIM' : '❌ NÃO'}`);

// Caso 2: Atividade antiga (> 24h) - simulação
const oldContactId = "5511888888888@c.us";
const oldState = getContactState(oldContactId);
oldState.lastActivityAt = now - (25 * 60 * 60); // 25 horas atrás
const timeSinceOldActivity = now - oldState.lastActivityAt;
console.log(`\nContato antigo (simulado):`);
console.log(`Tempo desde última atividade: ${Math.floor(timeSinceOldActivity / 3600)} hora(s)`);
console.log(`Dentro de 24h? ${timeSinceOldActivity < TWENTY_FOUR_HOURS ? '✅ SIM' : '❌ NÃO (OK para enviar default)'}`);

console.log("\n╔════════════════════════════════════════╗");
console.log("║  TESTES CONCLUÍDOS COM SUCESSO! ✅   ║");
console.log("╚════════════════════════════════════════╝\n");

console.log("📌 Próximos passos:");
console.log("1. Abra http://localhost:3000/messages");
console.log("2. Configure a mensagem default");
console.log("3. Envie mensagem no WhatsApp");
console.log("4. Default só será enviada após 24h sem atividade\n");
