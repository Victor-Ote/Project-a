/**
 * Exemplos de teste dos endpoints de Debug Sessions API
 * Use com Node.js (>= 12)
 */

const http = require('http');

// ====================================
// CONFIGURAÇÃO
// ====================================
const BASE_URL = 'http://localhost:3000';
const TOKEN = 'mytoken123456'; // Altere para seu token

// ====================================
// HELPER: Fazer requisições HTTP
// ====================================
function makeRequest(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// ====================================
// TESTE 1: Listar Sessões (GET)
// ====================================
async function testListSessions() {
  console.log('\n========================================');
  console.log('[TEST 1] Listar Sessões (GET)');
  console.log('========================================');
  
  const path = `/api/t/${TOKEN}/sessions`;
  console.log(`📍 GET ${path}`);
  
  try {
    const { status, body } = await makeRequest('GET', path);
    console.log(`\n✅ Status: ${status}`);
    console.log('📦 Response:', JSON.stringify(body, null, 2));
    return body;
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

// ====================================
// TESTE 2: Limpar Sessões (POST)
// ====================================
async function testClearSessions() {
  console.log('\n========================================');
  console.log('[TEST 2] Limpar Sessões (POST)');
  console.log('========================================');
  
  const path = `/api/t/${TOKEN}/sessions/clear`;
  console.log(`📍 POST ${path}`);
  
  try {
    const { status, body } = await makeRequest('POST', path);
    console.log(`\n✅ Status: ${status}`);
    console.log('📦 Response:', JSON.stringify(body, null, 2));
    return body;
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

// ====================================
// TESTE 3: Testar com Token Inválido
// ====================================
async function testInvalidToken() {
  console.log('\n========================================');
  console.log('[TEST 3] Token Inválido (Deve retornar 404)');
  console.log('========================================');
  
  const invalidToken = 'invalidtoken';
  const path = `/api/t/${invalidToken}/sessions`;
  console.log(`📍 GET ${path}`);
  
  try {
    const { status, body } = await makeRequest('GET', path);
    console.log(`\n✅ Status: ${status} (esperado: 400 ou 404)`);
    console.log('📦 Response:', JSON.stringify(body, null, 2));
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

// ====================================
// TESTE 4: Fluxo Completo
// ====================================
async function testCompleteFlow() {
  console.log('\n========================================');
  console.log('[TEST 4] Fluxo Completo');
  console.log('========================================');
  
  console.log('\n1️⃣ Listando sessões iniciais...');
  const sessions1 = await testListSessions();
  const initialCount = sessions1?.count || 0;
  console.log(`   → ${initialCount} sessões encontradas`);
  
  console.log('\n2️⃣ Limpando todas as sessões...');
  const clearResult = await testClearSessions();
  console.log(`   → ${clearResult?.cleared || 0} sessões removidas`);
  
  console.log('\n3️⃣ Verificando após limpeza...');
  const sessions2 = await testListSessions();
  const finalCount = sessions2?.count || 0;
  console.log(`   → ${finalCount} sessões encontradas (esperado: 0)`);
  
  console.log('\n✅ Fluxo completo concluído!');
}

// ====================================
// TESTE 5: Com Fetch API (Moderno)
// ====================================
async function testWithFetchAPI() {
  if (typeof fetch === 'undefined') {
    console.log('\n⚠️  Fetch API não disponível nesta versão do Node.js');
    console.log('   Use Node.js >= 18 ou npm install node-fetch');
    return;
  }

  console.log('\n========================================');
  console.log('[TEST 5] Usando Fetch API');
  console.log('========================================');
  
  try {
    // GET
    console.log(`\n📍 GET /api/t/${TOKEN}/sessions`);
    const res1 = await fetch(`${BASE_URL}/api/t/${TOKEN}/sessions`);
    const data1 = await res1.json();
    console.log(`✅ Status: ${res1.status}`);
    console.log('📦 Response:', JSON.stringify(data1, null, 2));
    
    // POST
    console.log(`\n📍 POST /api/t/${TOKEN}/sessions/clear`);
    const res2 = await fetch(`${BASE_URL}/api/t/${TOKEN}/sessions/clear`, {
      method: 'POST'
    });
    const data2 = await res2.json();
    console.log(`✅ Status: ${res2.status}`);
    console.log('📦 Response:', JSON.stringify(data2, null, 2));
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

// ====================================
// MAIN: Executar Testes
// ====================================
async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Debug Sessions API - Testes Node.js  ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\nToken: ${TOKEN}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('\n⚠️  INSTRUÇÕES:');
  console.log('   1. Certifique-se que npm start está rodando');
  console.log('   2. Envie mensagens no WhatsApp para criar sessões');
  console.log('   3. Depois execute este script\n');

  // Escolha qual teste rodar
  const testType = process.argv[2] || 'all';

  switch (testType) {
    case 'list':
      await testListSessions();
      break;
    case 'clear':
      await testClearSessions();
      break;
    case 'invalid':
      await testInvalidToken();
      break;
    case 'complete':
      await testCompleteFlow();
      break;
    case 'fetch':
      await testWithFetchAPI();
      break;
    case 'all':
    default:
      await testListSessions();
      await new Promise(r => setTimeout(r, 500));
      await testClearSessions();
      await new Promise(r => setTimeout(r, 500));
      await testInvalidToken();
      console.log('\n✅ Todos os testes executados!');
  }

  console.log('\n');
}

// ====================================
// EXEMPLOS DE USO VIA LINHA DE COMANDO
// ====================================
/*

# Executar todos os testes
node test_sessions.js

# Listar sessões
node test_sessions.js list

# Limpar sessões
node test_sessions.js clear

# Testar token inválido
node test_sessions.js invalid

# Fluxo completo
node test_sessions.js complete

# Teste com Fetch API (Node.js >= 18)
node test_sessions.js fetch

*/

// ====================================
// HELPER: Formatar output para console
// ====================================
function prettyPrint(label, data) {
  console.log(`\n${label}:`);
  console.log(JSON.stringify(data, null, 2));
}

// ====================================
// EXEMPLOS ADICIONAIS
// ====================================

/**
 * Exemplo: Monitorar mudanças de sessões
 */
async function monitorSessions(interval = 5000) {
  console.log(`\n📊 Monitorando sessões a cada ${interval}ms...`);
  console.log('Pressione Ctrl+C para parar\n');
  
  let lastCount = 0;
  
  const timer = setInterval(async () => {
    try {
      const { body } = await makeRequest('GET', `/api/t/${TOKEN}/sessions`);
      const currentCount = body?.count || 0;
      
      if (currentCount !== lastCount) {
        console.log(`⏱️  [${new Date().toLocaleTimeString()}] Sessions: ${lastCount} → ${currentCount}`);
        if (body?.sessions) {
          body.sessions.forEach(s => {
            console.log(`   - ${s.chatId}: step=${s.step}, mode=${s.mode}`);
          });
        }
        lastCount = currentCount;
      }
    } catch (err) {
      console.error('❌ Erro ao monitorar:', err.message);
    }
  }, interval);
  
  process.on('SIGINT', () => {
    console.log('\n\n✋ Monitoramento interrompido');
    clearInterval(timer);
    process.exit(0);
  });
}

// Exportar para uso em outros módulos
module.exports = {
  testListSessions,
  testClearSessions,
  testInvalidToken,
  testCompleteFlow,
  monitorSessions,
  makeRequest
};

// Executar se rodado diretamente
if (require.main === module) {
  main().catch(console.error);
}
