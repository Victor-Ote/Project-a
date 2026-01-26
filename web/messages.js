let rules = [];
let defaultMessage = "";

const rulesContainer = document.getElementById("rules-container");
const btnAdd = document.getElementById("btn-add");
const btnSave = document.getElementById("btn-save");
const defaultMessageInput = document.getElementById("default-message-input");

// =====================================
// FUNÇÃO: CRIAR SVG TRASH ICON
// =====================================
function createTrashIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  
  const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path1.setAttribute("d", "M3 6h18");
  
  const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path2.setAttribute("d", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2");
  
  const path3 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path3.setAttribute("d", "M5 6v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6");
  
  const path4 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path4.setAttribute("d", "M10 11v6");
  
  const path5 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path5.setAttribute("d", "M14 11v6");
  
  svg.appendChild(path1);
  svg.appendChild(path2);
  svg.appendChild(path3);
  svg.appendChild(path4);
  svg.appendChild(path5);
  
  return svg;
}

// =====================================
// FUNÇÃO: CRIAR LINHA DE REGRA
// =====================================
function createRuleRow(received = "", sent = "") {
  const row = document.createElement("div");
  row.className = "rule-row";

  const inputsWrapper = document.createElement("div");
  inputsWrapper.className = "rule-inputs-wrapper";

  const receivedGroup = document.createElement("div");
  receivedGroup.className = "rule-input-group";
  receivedGroup.innerHTML = `
    <label>Mensagem recebida</label>
    <input type="text" class="received-input" placeholder="Ex: olá, oi..." value="${received}">
  `;

  const sentGroup = document.createElement("div");
  sentGroup.className = "rule-input-group";
  sentGroup.innerHTML = `
    <label>Mensagem enviada</label>
    <input type="text" class="sent-input" placeholder="Ex: Olá! Como posso ajudar?" value="${sent}">
  `;

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn-trash";
  deleteBtn.setAttribute("type", "button");
  deleteBtn.setAttribute("title", "Deletar esta regra");
  deleteBtn.appendChild(createTrashIcon());

  // Event listener para deletar a linha
  deleteBtn.addEventListener("click", (e) => {
    e.preventDefault();
    row.remove();
  });

  inputsWrapper.appendChild(receivedGroup);
  inputsWrapper.appendChild(sentGroup);

  row.appendChild(inputsWrapper);
  row.appendChild(deleteBtn);

  return row;
}

// =====================================
// FUNÇÃO: RENDERIZAR REGRAS
// =====================================
function renderRules() {
  rulesContainer.innerHTML = "";
  
  if (rules.length === 0) {
    // Criar uma linha vazia padrão
    const emptyRow = createRuleRow("", "");
    rulesContainer.appendChild(emptyRow);
    return;
  }

  rules.forEach((rule) => {
    const row = createRuleRow(rule.received, rule.sent);
    rulesContainer.appendChild(row);
  });
}

// =====================================
// FUNÇÃO: ADICIONAR LINHA
// =====================================
function addRule() {
  const newRow = createRuleRow("", "");
  rulesContainer.appendChild(newRow);
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
    
    // Apenas adicionar se AMBOS os campos têm valor após trim
    if (received && sent) {
      newRules.push({ received, sent });
    }
  });

  // Obter default message
  const newDefaultMessage = defaultMessageInput.value.trim();

  try {
    // Salvar regras
    const rulesResponse = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRules)
    });

    if (!rulesResponse.ok) {
      throw new Error("Erro ao salvar regras");
    }

    const rulesResult = await rulesResponse.json();

    // Salvar settings (default message)
    const settingsResponse = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultMessage: newDefaultMessage })
    });

    if (!settingsResponse.ok) {
      throw new Error("Erro ao salvar mensagem default");
    }

    alert(`✅ Salvo com sucesso!\n- ${rulesResult.count} regra(s)\n- Mensagem default: ${newDefaultMessage ? 'configurada' : 'removida'}`);
    loadAll();
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
      throw new Error("Erro ao carregar regras");
    }

    rules = await response.json();
    renderRules();
  } catch (err) {
    console.error("❌ Erro ao carregar regras:", err);
    rules = [];
    renderRules();
  }
}

// =====================================
// FUNÇÃO: CARREGAR SETTINGS
// =====================================
async function loadSettings() {
  try {
    const response = await fetch("/api/settings");
    
    if (!response.ok) {
      throw new Error("Erro ao carregar settings");
    }

    const settings = await response.json();
    defaultMessage = settings.defaultMessage || "";
    defaultMessageInput.value = defaultMessage;
  } catch (err) {
    console.error("❌ Erro ao carregar settings:", err);
    defaultMessage = "";
    defaultMessageInput.value = "";
  }
}

// =====================================
// FUNÇÃO: CARREGAR TUDO
// =====================================
async function loadAll() {
  await loadSettings();
  await loadRules();
}

// =====================================
// EVENT LISTENERS
// =====================================
btnAdd.addEventListener("click", addRule);
btnSave.addEventListener("click", saveRules);

// Carregar tudo ao abrir a página
document.addEventListener("DOMContentLoaded", loadAll);

console.log("✅ messages.js carregado");
