const { getContactState } = require("../state/contactStateStore");

// =====================================
// FUNÇÃO: VERIFICAR SE DEVE ENVIAR DEFAULT
// =====================================
async function shouldSendDefault(chat, contactId, opts = {}) {
  const { windowSeconds = 24 * 60 * 60, ignoreMsgId = null } = opts;
  const now = Math.floor(Date.now() / 1000); // UNIX seconds

  try {
    // 1) Verificar stateStore
    const state = getContactState(contactId);
    
    // Se houve atividade dentro da janela configurada segundo stateStore
    if (state.lastActivityAt > 0 && (now - state.lastActivityAt) < windowSeconds) {
      console.log(`⏭️  [${contactId}] Atividade recente no stateStore (${Math.floor((now - state.lastActivityAt) / 60)} min atrás, janela: ${Math.floor(windowSeconds / 60)} min)`);
      return false;
    }

    // 2) Dupla verificação: checar histórico real do chat
    console.log(`🔍 [${contactId}] Verificando histórico de mensagens (janela: ${Math.floor(windowSeconds / 60)} min)...`);
    
    const messages = await chat.fetchMessages({ limit: 50 });
    
    // Verificar se existe qualquer mensagem dentro da janela
    for (const msg of messages) {
      // Ignorar a mensagem atual (para não bloquear a primeira tentativa)
      if (ignoreMsgId && msg.id._serialized === ignoreMsgId) {
        continue;
      }

      const msgTimestamp = msg.timestamp; // já vem em UNIX seconds
      
      if ((now - msgTimestamp) < windowSeconds) {
        console.log(`⏭️  [${contactId}] Mensagem encontrada no histórico (${Math.floor((now - msgTimestamp) / 60)} min atrás, fromMe: ${msg.fromMe})`);
        return false;
      }
    }

    // 3) Nenhuma atividade dentro da janela
    console.log(`✅ [${contactId}] OK para enviar default (sem atividade nas últimas ${Math.floor(windowSeconds / 60)} min)`);
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
