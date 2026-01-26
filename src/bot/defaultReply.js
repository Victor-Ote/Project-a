const { getContactState } = require("../state/contactStateStore");

// =====================================
// CONSTANTES
// =====================================
const TWENTY_FOUR_HOURS = 24 * 60 * 60; // segundos

// =====================================
// FUNÇÃO: VERIFICAR SE DEVE ENVIAR DEFAULT
// =====================================
async function shouldSendDefault(chat, contactId) {
  const now = Math.floor(Date.now() / 1000); // UNIX seconds

  try {
    // 1) Verificar stateStore
    const state = getContactState(contactId);
    
    // Se houve atividade nas últimas 24h segundo stateStore
    if (state.lastActivityAt > 0 && (now - state.lastActivityAt) < TWENTY_FOUR_HOURS) {
      console.log(`⏭️  [${contactId}] Atividade recente no stateStore (${Math.floor((now - state.lastActivityAt) / 60)} min atrás)`);
      return false;
    }

    // 2) Dupla verificação: checar histórico real do chat
    console.log(`🔍 [${contactId}] Verificando histórico de mensagens...`);
    
    const messages = await chat.fetchMessages({ limit: 50 });
    
    // Verificar se existe qualquer mensagem nas últimas 24h
    for (const msg of messages) {
      const msgTimestamp = msg.timestamp; // já vem em UNIX seconds
      
      if ((now - msgTimestamp) < TWENTY_FOUR_HOURS) {
        console.log(`⏭️  [${contactId}] Mensagem encontrada no histórico (${Math.floor((now - msgTimestamp) / 60)} min atrás, fromMe: ${msg.fromMe})`);
        return false;
      }
    }

    // 3) Nenhuma atividade nas últimas 24h
    console.log(`✅ [${contactId}] OK para enviar default (sem atividade nas últimas 24h)`);
    return true;

  } catch (err) {
    console.error(`❌ Erro ao verificar histórico de ${contactId}:`, err.message);
    // Em caso de erro, ser conservador e não enviar
    return false;
  }
}

// =====================================
// EXPORTS
// =====================================
module.exports = {
  shouldSendDefault
};
