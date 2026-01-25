let rules = [];

const rulesContainer = document.getElementById("rules-container");
const btnAdd = document.getElementById("btn-add");
const btnSave = document.getElementById("btn-save");

// =====================================
// FUNÇÃO: CRIAR LINHA DE REGRA
// =====================================
function createRuleRow(received = "", sent = "") {
  const row = document.createElement("div");
  row.className = "rule-row";

  row.innerHTML = `
    <div class="rule-input-group">
      <label>Mensagem recebida</label>
      <input type="text" class="received-input" placeholder="Ex: olá, oi..." value="${received}">
    </div>
    <div class="rule-input-group">
      <label>Mensagem enviada</label>
      <input type="text" class="sent-input" placeholder="Ex: Olá! Como posso ajudar?" value="${sent}">
    </div>
  `;

  return row;
}

// =====================================
// FUNÇÃO: RENDERIZAR REGRAS
// =====================================
function renderRules() {
  rulesContainer.innerHTML = "";
  
  if (rules.length === 0) {
    rulesContainer.innerHTML = '<p class="empty-message">Nenhuma regra adicionada. Clique em "Adicionar" para começar.</p>';
    return;
  }

  rules.forEach((rule, index) => {
    const row = createRuleRow(rule.received, rule.sent);
    rulesContainer.appendChild(row);
  });
}

// =====================================
// FUNÇÃO: ADICIONAR LINHA
// =====================================
function addRule() {
  rules.push({ received: "", sent: "" });
  renderRules();
}

// =====================================
// FUNÇÃO: SALVAR REGRAS
// =====================================
async function saveRules() {
  const rows = document.querySelectorAll(".rule-row");
  const newRules = [];

  rows.forEach(row => {
    const received = row.querySelector(".received-input").value.trim();
    const sent = row.querySelector(".sent-input").value.trim();
    
    if (received && sent) {
      newRules.push({ received, sent });
    }
  });

  try {
    const response = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRules)
    });

    if (!response.ok) {
      throw new Error("Erro ao salvar");
    }

    const result = await response.json();
    alert(`✅ ${result.count} regra(s) salva(s) com sucesso!`);
    loadRules();
  } catch (err) {
    alert(`❌ Erro ao salvar: ${err.message}`);
  }
}

// =====================================
// FUNÇÃO: CARREGAR REGRAS
// =====================================
async function loadRules() {
  try {
    const response = await fetch("/api/rules");
    
    if (!response.ok) {
      throw new Error("Erro ao carregar");
    }

    rules = await response.json();
    renderRules();
  } catch (err) {
    alert(`❌ Erro ao carregar: ${err.message}`);
    rules = [];
    renderRules();
  }
}

// =====================================
// EVENT LISTENERS
// =====================================
btnAdd.addEventListener("click", addRule);
btnSave.addEventListener("click", saveRules);

// Carregar regras ao abrir a página
document.addEventListener("DOMContentLoaded", loadRules);

console.log("✅ messages.js carregado");
