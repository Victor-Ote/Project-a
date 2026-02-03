#!/usr/bin/env node

/**
 * Script de teste para validar PASSO 13
 * Testa:
 * 1. Criar dois tokens diferentes
 * 2. Salvar configs diferentes via POST /api/t/:token/config
 * 3. Verificar se ao conectar em /t/:token, os textos dos menus são diferentes
 */

const http = require("http");

const BASE_URL = "http://localhost:3000";

// Tokens de teste
const TOKEN_A = "testtoken_aaaaaaaa_" + Date.now();
const TOKEN_B = "testtoken_bbbbbbbb_" + Date.now();

// Configurações diferentes para cada tenant
const CONFIG_A = {
  menu: {
    triggers: ["menu", "#menu", "start"],
    texts: {
      encerrado: "✅ Tenant A: Atendimento encerrado.",
      somenteNumerosMenu: "⚠️ Tenant A: Apenas números!",
      somenteNumerosPlanos: "⚠️ Tenant A: Apenas números nos planos!",
      opcaoInvalidaMenu: "⚠️ Tenant A: Opção inválida.",
      opcaoInvalidaPlanos: "⚠️ Tenant A: Opção inválida nos planos.",
      planosBasico: "✅ Tenant A: Plano Básico - R$ 99/mês",
      planosPro: "✅ Tenant A: Plano Pro - R$ 199/mês",
      comoFuncionaPlaceholder: "✅ Tenant A: Como funciona (placeholder)",
      atendentePlaceholder: "✅ Tenant A: Falar com atendente (placeholder)"
    },
    steps: {
      MENU_INICIAL: {
        header: "🎉 Bem-vindo ao Tenant A!\nResponda com um número:",
        options: [
          "1️⃣ Planos A",
          "2️⃣ Como funciona A",
          "3️⃣ Atendente A",
          "",
          "9️⃣ Repetir",
          "0️⃣ Sair"
        ]
      },
      PLANOS: {
        header: "📦 Planos - Tenant A\nEscolha uma opção:",
        options: [
          "1️⃣ Básico - A",
          "2️⃣ Pro - A",
          "",
          "9️⃣ Voltar",
          "0️⃣ Sair"
        ]
      }
    }
  },
  rules: [
    { input: "oi", sent: "Olá! Bem-vindo ao Tenant A!" }
  ],
  settings: {
    defaultMessage: "Obrigado por contatar Tenant A!",
    windowSeconds: 3600
  }
};

const CONFIG_B = {
  menu: {
    triggers: ["menu", "#menu", "start"],
    texts: {
      encerrado: "✅ Tenant B: Atendimento encerrado.",
      somenteNumerosMenu: "⚠️ Tenant B: Apenas números!",
      somenteNumerosPlanos: "⚠️ Tenant B: Apenas números nos planos!",
      opcaoInvalidaMenu: "⚠️ Tenant B: Opção inválida.",
      opcaoInvalidaPlanos: "⚠️ Tenant B: Opção inválida nos planos.",
      planosBasico: "✅ Tenant B: Plano Básico - R$ 149/mês",
      planosPro: "✅ Tenant B: Plano Pro - R$ 299/mês",
      comoFuncionaPlaceholder: "✅ Tenant B: Como funciona (placeholder)",
      atendentePlaceholder: "✅ Tenant B: Falar com atendente (placeholder)"
    },
    steps: {
      MENU_INICIAL: {
        header: "🌟 Bem-vindo ao Tenant B!\nResponda com um número:",
        options: [
          "1️⃣ Planos B",
          "2️⃣ Como funciona B",
          "3️⃣ Atendente B",
          "",
          "9️⃣ Repetir",
          "0️⃣ Sair"
        ]
      },
      PLANOS: {
        header: "📦 Planos - Tenant B\nEscolha uma opção:",
        options: [
          "1️⃣ Básico - B",
          "2️⃣ Pro - B",
          "",
          "9️⃣ Voltar",
          "0️⃣ Sair"
        ]
      }
    }
  },
  rules: [
    { input: "oi", sent: "Olá! Bem-vindo ao Tenant B!" }
  ],
  settings: {
    defaultMessage: "Obrigado por contatar Tenant B!",
    windowSeconds: 7200
  }
};

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(path, BASE_URL);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 3000,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        "Content-Type": "application/json"
      }
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("\n========================================");
  console.log("PASSO 13 - TESTE DE CONFIGURAÇÃO POR TENANT");
  console.log("========================================\n");

  try {
    // Teste 1: Salvar config para Tenant A
    console.log("[TEST] 1. Salvando configuração para Tenant A...");
    const resA = await makeRequest("POST", `/api/t/${TOKEN_A}/config`, CONFIG_A);
    console.log(`Status: ${resA.status}`);
    console.log(`Response: ${JSON.stringify(resA.body)}`);
    if (resA.status !== 200) {
      throw new Error("Falha ao salvar config Tenant A");
    }
    const tenantIdA = resA.body.tenantId;
    console.log(`✅ Tenant A criado: ${tenantIdA}\n`);

    // Teste 2: Salvar config para Tenant B
    console.log("[TEST] 2. Salvando configuração para Tenant B...");
    const resB = await makeRequest("POST", `/api/t/${TOKEN_B}/config`, CONFIG_B);
    console.log(`Status: ${resB.status}`);
    console.log(`Response: ${JSON.stringify(resB.body)}`);
    if (resB.status !== 200) {
      throw new Error("Falha ao salvar config Tenant B");
    }
    const tenantIdB = resB.body.tenantId;
    console.log(`✅ Tenant B criado: ${tenantIdB}\n`);

    // Teste 3: Recuperar config de Tenant A
    console.log("[TEST] 3. Recuperando configuração de Tenant A via GET...");
    const getResA = await makeRequest("GET", `/t/${TOKEN_A}/config`);
    console.log(`Status: ${getResA.status}`);
    console.log(`Menu header: ${getResA.body.steps?.MENU_INICIAL?.header}`);
    if (getResA.body.steps?.MENU_INICIAL?.header.includes("Tenant A")) {
      console.log(`✅ Configuração de Tenant A carregada corretamente\n`);
    } else {
      console.log(`❌ Erro: Config de Tenant A não encontrada\n`);
    }

    // Teste 4: Recuperar config de Tenant B
    console.log("[TEST] 4. Recuperando configuração de Tenant B via GET...");
    const getResB = await makeRequest("GET", `/t/${TOKEN_B}/config`);
    console.log(`Status: ${getResB.status}`);
    console.log(`Menu header: ${getResB.body.steps?.MENU_INICIAL?.header}`);
    if (getResB.body.steps?.MENU_INICIAL?.header.includes("Tenant B")) {
      console.log(`✅ Configuração de Tenant B carregada corretamente\n`);
    } else {
      console.log(`❌ Erro: Config de Tenant B não encontrada\n`);
    }

    // Resumo
    console.log("========================================");
    console.log("RESUMO DO TESTE");
    console.log("========================================");
    console.log(`Token A: ${TOKEN_A}`);
    console.log(`  Tenant ID: ${tenantIdA}`);
    console.log(`  URL: http://localhost:3000/t/${TOKEN_A}`);
    console.log(`  Menu: "${CONFIG_A.menu.steps.MENU_INICIAL.header}"`);
    console.log(`\nToken B: ${TOKEN_B}`);
    console.log(`  Tenant ID: ${tenantIdB}`);
    console.log(`  URL: http://localhost:3000/t/${TOKEN_B}`);
    console.log(`  Menu: "${CONFIG_B.menu.steps.MENU_INICIAL.header}"`);
    console.log("\nPróximo passo: Conecte via WhatsApp em ambas as URLs");
    console.log("e envie 'menu' para verificar se os textos são diferentes.\n");

  } catch (err) {
    console.error("❌ Erro:", err.message);
    process.exit(1);
  }
}

runTests().then(() => {
  console.log("✅ Testes completados!");
  process.exit(0);
});
