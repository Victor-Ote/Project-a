function getTokenFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "t") {
    return decodeURIComponent(parts[1]);
  }
  return null;
}

function showMessage(text, type = "info") {
  const el = document.getElementById("ui-message");
  if (!el) return;
  el.style.display = "block";
  el.textContent = text;
  el.className = "status-container";
  if (type === "error") {
    el.style.borderLeftColor = "#dc3545";
  } else {
    el.style.borderLeftColor = "#667eea";
  }
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function normalizeConfig(payload) {
  if (!payload || typeof payload !== "object") {
    return { menu: {}, rules: [], settings: { defaultMessage: "", windowSeconds: 86400 } };
  }

  if (payload.menu || payload.rules || payload.settings) {
    return {
      menu: payload.menu || {},
      rules: Array.isArray(payload.rules) ? payload.rules : [],
      settings: payload.settings || { defaultMessage: "", windowSeconds: 86400 }
    };
  }

  return {
    menu: payload,
    rules: [],
    settings: { defaultMessage: "", windowSeconds: 86400 }
  };
}

function validateConfig(menu, rules, settings) {
  if (!menu || typeof menu !== "object") return "menu deve ser um objeto";
  if (!menu.steps || typeof menu.steps !== "object") return "menu.steps deve existir";
  if (!Array.isArray(rules)) return "rules deve ser um array";
  if (!settings || typeof settings !== "object") return "settings deve ser um objeto";
  if (typeof settings.defaultMessage !== "string") return "settings.defaultMessage deve ser string";
  if (typeof settings.windowSeconds !== "number" || Number.isNaN(settings.windowSeconds)) {
    return "settings.windowSeconds deve ser number";
  }
  if (settings.windowSeconds < 0) return "settings.windowSeconds deve ser >= 0";
  return null;
}

function parseWindowSeconds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 86400;
}

function removeStepAndFixReferences(menu, stepIdToRemove) {
  const clone = JSON.parse(JSON.stringify(menu || {}));
  const steps = clone.steps || {};
  let removedRefsCount = 0;

  if (!steps[stepIdToRemove]) {
    return { menu: clone, removedRefsCount: 0 };
  }

  delete steps[stepIdToRemove];

  Object.values(steps).forEach((step) => {
    if (!Array.isArray(step.routes)) return;
    const before = step.routes.length;
    step.routes = step.routes.filter(route => {
      const action = route?.action;
      return !(action?.type === "GOTO" && action?.to === stepIdToRemove);
    });
    removedRefsCount += Math.max(0, before - step.routes.length);
  });

  clone.steps = steps;
  return { menu: clone, removedRefsCount };
}

function renderSessions(list = []) {
  const tbody = document.getElementById("sessions-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!Array.isArray(list) || list.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="4">Nenhuma sessão encontrada</td>`;
    tbody.appendChild(row);
    return;
  }

  list.forEach((s) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${s.chatId || ""}</td>
      <td>${s.step || ""}</td>
      <td>${Array.isArray(s.stack) ? s.stack.length : s.stackLen || 0}</td>
      <td>${s.updatedAt || ""}</td>
    `;
    tbody.appendChild(row);
  });
}

function createOptionRow(option, onChange, stepOptions) {
  const row = document.createElement("div");
  row.className = "option-row";

  const matchGroup = document.createElement("div");
  matchGroup.innerHTML = `
    <label>Opção</label>
    <input type="text" value="${option.match || ""}" placeholder="Ex: 1, voltar">
  `;

  const actionGroup = document.createElement("div");
  actionGroup.innerHTML = `
    <label>Ação</label>
    <select>
      <option value="GOTO">Ir para menu</option>
      <option value="BACK">Voltar</option>
      <option value="END">Encerrar</option>
      <option value="TEXT">Enviar texto</option>
      <option value="HANDOFF">Atendente</option>
    </select>
  `;

  const targetGroup = document.createElement("div");
  targetGroup.innerHTML = `
    <label>Destino / Texto</label>
    <input type="text" placeholder="MENU_DESTINO ou mensagem">
    <textarea rows="3" class="default-message-input" style="min-height:90px; display:none;"></textarea>
  `;

  const select = actionGroup.querySelector("select");
  const matchInput = matchGroup.querySelector("input");
  const targetInput = targetGroup.querySelector("input");
  const targetTextarea = targetGroup.querySelector("textarea");

  select.value = option.type || "GOTO";
  targetInput.value = option.value || "";
  targetTextarea.value = option.value || "";

  function refreshTargetPlaceholder() {
    const isText = select.value === "TEXT";
    targetInput.style.display = isText ? "none" : "block";
    targetTextarea.style.display = isText ? "block" : "none";

    if (select.value === "GOTO") {
      targetInput.placeholder = `Destino: ${stepOptions.join(", ") || "MENU_INICIAL"}`;
    } else if (select.value === "TEXT") {
      targetTextarea.placeholder = "Mensagem para enviar";
    } else if (select.value === "END") {
      targetInput.placeholder = "Mensagem final (opcional)";
    } else {
      targetInput.placeholder = "(não aplicável)";
    }
  }

  refreshTargetPlaceholder();

  matchInput.addEventListener("input", () => {
    option.match = matchInput.value;
    onChange(false);
  });

  select.addEventListener("change", () => {
    option.type = select.value;
    targetInput.value = option.value || "";
    targetTextarea.value = option.value || "";
    refreshTargetPlaceholder();
    onChange(false);
  });

  targetInput.addEventListener("input", () => {
    option.value = targetInput.value;
    onChange(false);
  });

  targetTextarea.addEventListener("input", () => {
    option.value = targetTextarea.value;
    onChange(false);
  });

  row.appendChild(matchGroup);
  row.appendChild(actionGroup);
  row.appendChild(targetGroup);

  return row;
}

function createBlockCard(block, onChange, onRemove, stepOptions) {
  const card = document.createElement("div");
  card.className = "block-card";

  const header = document.createElement("div");
  header.className = "block-header";
  header.innerHTML = `
    <strong>${block.stepId}</strong>
    <button class="btn btn-danger" type="button">Remover</button>
  `;

  const removeBtn = header.querySelector("button");
  removeBtn.addEventListener("click", () => onRemove(block));

  const grid = document.createElement("div");
  grid.className = "block-grid";
  grid.innerHTML = `
    <div>
      <label>ID do menu</label>
      <input type="text" value="${block.stepId}" placeholder="MENU_INICIAL">
    </div>
    <div>
      <label>Texto da mensagem</label>
      <textarea rows="4" class="default-message-input" style="min-height:120px;">${block.text}</textarea>
    </div>
    <div>
      <label>Mensagem de fallback</label>
      <input type="text" value="${block.fallbackText}" placeholder="Opção inválida">
    </div>
  `;

  const [idInput, textArea, fallbackInput] = grid.querySelectorAll("input, textarea");
  idInput.addEventListener("change", () => {
    block.stepId = idInput.value || "MENU_INICIAL";
    header.querySelector("strong").textContent = block.stepId;
    onChange(true);
  });
  textArea.addEventListener("input", () => {
    block.text = textArea.value;
    onChange(false);
  });
  fallbackInput.addEventListener("input", () => {
    block.fallbackText = fallbackInput.value;
    onChange(false);
  });

  const optionsContainer = document.createElement("div");
  const optionsHeader = document.createElement("div");
  optionsHeader.className = "section-header";
  optionsHeader.innerHTML = `
    <h3>Opções</h3>
    <button class="btn btn-primary" type="button">Adicionar opção</button>
  `;
  const addOptionBtn = optionsHeader.querySelector("button");
  addOptionBtn.addEventListener("click", () => {
    block.options.push({ match: "", type: "GOTO", value: "" });
    onChange(true);
  });

  const optionsList = document.createElement("div");
  function renderOptions() {
    optionsList.innerHTML = "";
    block.options.forEach((opt, idx) => {
      const row = createOptionRow(opt, onChange, stepOptions());
      const remove = document.createElement("button");
      remove.className = "btn btn-danger";
      remove.textContent = "Remover";
      remove.type = "button";
      remove.addEventListener("click", () => {
        block.options.splice(idx, 1);
        onChange(true);
      });
      const actionWrap = document.createElement("div");
      actionWrap.className = "option-actions";
      actionWrap.appendChild(remove);
      row.appendChild(actionWrap);
      optionsList.appendChild(row);
    });
  }

  optionsContainer.appendChild(optionsHeader);
  optionsContainer.appendChild(optionsList);

  card.appendChild(header);
  card.appendChild(grid);
  card.appendChild(optionsContainer);

  renderOptions();

  card.renderOptions = renderOptions;
  return card;
}

document.addEventListener("DOMContentLoaded", () => {
  const token = getTokenFromPath();
  const API_BASE = "/api/t/" + encodeURIComponent(token || "");

  const blocksContainer = document.getElementById("blocks-container");
  const settingsDefaultMessage = document.getElementById("settings-default-message");
  const settingsWindowSeconds = document.getElementById("settings-window-seconds");
  const menuTextarea = document.getElementById("menu-json");
  const rulesTextarea = document.getElementById("rules-json");
  const settingsTextarea = document.getElementById("settings-json");

  const btnAddBlock = document.getElementById("btn-add-block");
  const btnSave = document.getElementById("btn-save");
  const btnLoad = document.getElementById("btn-load");
  const btnExport = document.getElementById("btn-export");
  const btnApplyAdvanced = document.getElementById("btn-apply-advanced");
  const fileImport = document.getElementById("file-import");
  const btnListSessions = document.getElementById("btn-list-sessions");
  const btnClearSessions = document.getElementById("btn-clear-sessions");
  const btnBack = document.getElementById("btn-back");
  const botName = document.getElementById("bot-name");
  const statusChip = document.getElementById("status-chip");

  if (!token) {
    showMessage("Token ausente na URL", "error");
    console.error("❌ Token ausente na URL");
    return;
  }

  if (botName) botName.textContent = `🤖 Bot do Tenant: ${token}`;
  if (btnBack) btnBack.href = `${window.location.origin}/t/${encodeURIComponent(token)}`;

  let uiBlocks = [];
  let currentRules = [];
  let currentTriggers = ["menu"];

  function stepOptions() {
    return uiBlocks.map(b => b.stepId).filter(Boolean);
  }

  function syncAdvanced() {
    const menu = buildMenuFromUI();
    menuTextarea.value = JSON.stringify(menu, null, 2);
    rulesTextarea.value = JSON.stringify(currentRules || [], null, 2);
    settingsTextarea.value = JSON.stringify({
      defaultMessage: settingsDefaultMessage.value || "",
      windowSeconds: parseWindowSeconds(settingsWindowSeconds.value)
    }, null, 2);
  }

  function renderBlocks() {
    if (!blocksContainer) return;
    blocksContainer.innerHTML = "";
    uiBlocks.forEach((block) => {
      const card = createBlockCard(block, (shouldRerender) => {
        if (shouldRerender) {
          renderBlocks();
        }
        syncAdvanced();
      }, (toRemove) => {
        if ((toRemove.stepId || "") === "MENU_INICIAL") {
          showMessage("MENU_INICIAL não pode ser removido", "error");
          return;
        }

        const confirmed = window.confirm(`Remover o menu ${toRemove.stepId}? Isso também removerá opções que apontam para ele.`);
        if (!confirmed) return;

        const menu = buildMenuFromUI();
        const result = removeStepAndFixReferences(menu, toRemove.stepId);

        loadToUI(result.menu, currentRules, {
          defaultMessage: settingsDefaultMessage.value || "",
          windowSeconds: parseWindowSeconds(settingsWindowSeconds.value)
        });

        showMessage(`Menu ${toRemove.stepId} removido. ${result.removedRefsCount} opção(ões) atualizadas.`, "info");
        saveConfig();
      }, stepOptions);
      blocksContainer.appendChild(card);
      card.renderOptions();
    });
  }

  function createEmptyBlock(stepId) {
    return {
      stepId,
      text: "",
      fallbackText: "Opção inválida. Tente novamente.",
      options: []
    };
  }

  function buildMenuFromUI() {
    const steps = {};
    uiBlocks.forEach((block) => {
      const routes = block.options
        .filter(opt => opt.match && opt.match.trim().length > 0)
        .map(opt => {
          const matches = opt.match.split(",").map(m => m.trim()).filter(Boolean);
          const action = { type: opt.type || "GOTO" };

          if (action.type === "GOTO") action.to = opt.value || "MENU_INICIAL";
          if (action.type === "TEXT" || action.type === "END") action.text = opt.value || "";

          return { match: matches, action };
        });

      steps[block.stepId || "MENU_INICIAL"] = {
        text: block.text || "",
        routes,
        fallback: block.fallbackText ? { type: "TEXT", text: block.fallbackText } : undefined
      };
    });

    return {
      triggers: currentTriggers || ["menu"],
      steps
    };
  }

  function loadToUI(menu, rules, settings) {
    currentRules = Array.isArray(rules) ? rules : [];
    currentTriggers = menu?.triggers || ["menu"];

    uiBlocks = [];
    const steps = menu?.steps || {};
    const ordered = Object.keys(steps);
    if (steps.MENU_INICIAL) {
      uiBlocks.push({
        stepId: "MENU_INICIAL",
        text: steps.MENU_INICIAL.text || "",
        fallbackText: steps.MENU_INICIAL.fallback?.text || "Opção inválida. Tente novamente.",
        options: (steps.MENU_INICIAL.routes || []).map(r => ({
          match: (r.match || []).join(", "),
          type: r.action?.type || "GOTO",
          value: r.action?.to || r.action?.text || ""
        }))
      });
    }

    ordered.filter(id => id !== "MENU_INICIAL").forEach((id) => {
      const step = steps[id];
      uiBlocks.push({
        stepId: id,
        text: step?.text || "",
        fallbackText: step?.fallback?.text || "Opção inválida. Tente novamente.",
        options: (step?.routes || []).map(r => ({
          match: (r.match || []).join(", "),
          type: r.action?.type || "GOTO",
          value: r.action?.to || r.action?.text || ""
        }))
      });
    });

    if (uiBlocks.length === 0) {
      uiBlocks.push(createEmptyBlock("MENU_INICIAL"));
    }

    settingsDefaultMessage.value = settings?.defaultMessage || "";
    settingsWindowSeconds.value = settings?.windowSeconds || 86400;

    renderBlocks();
    syncAdvanced();
  }

  async function loadConfig() {
    try {
      showMessage("Carregando config...");
      const res = await fetch(`${API_BASE}/config`);
      if (!res.ok) throw new Error("Erro ao carregar config");
      const payload = await res.json();
      const normalized = normalizeConfig(payload);
      loadToUI(normalized.menu, normalized.rules, normalized.settings);
      showMessage("Config carregada com sucesso");
    } catch (err) {
      console.error("❌ Erro ao carregar config:", err);
      showMessage("Erro ao carregar config", "error");
    }
  }

  async function saveConfig() {
    const menu = buildMenuFromUI();
    const rules = currentRules || [];
    const settings = {
      defaultMessage: settingsDefaultMessage.value || "",
      windowSeconds: Number(settingsWindowSeconds.value)
    };

    const validationError = validateConfig(menu, rules, settings);
    if (validationError) {
      showMessage(validationError, "error");
      console.error("❌ Validação falhou:", validationError);
      return;
    }

    try {
      showMessage("Salvando config...");
      const res = await fetch(`${API_BASE}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu, rules, settings })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Erro ao salvar config");
      }

      syncAdvanced();
      showMessage("Config salva com sucesso");
    } catch (err) {
      console.error("❌ Erro ao salvar config:", err);
      showMessage("Erro ao salvar config", "error");
    }
  }

  function exportConfig() {
    const menu = buildMenuFromUI();
    const rules = currentRules || [];
    const settings = {
      defaultMessage: settingsDefaultMessage.value || "",
      windowSeconds: parseWindowSeconds(settingsWindowSeconds.value)
    };
    const blob = new Blob([JSON.stringify({ menu, rules, settings }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `config_${token}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importConfig(file) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const normalized = normalizeConfig(payload);
      loadToUI(normalized.menu, normalized.rules, normalized.settings);
      showMessage("Config importada. Revise e salve.");
    } catch (err) {
      console.error("❌ Erro ao importar:", err);
      showMessage("Erro ao importar JSON", "error");
    }
  }

  function applyAdvanced() {
    const menu = safeJsonParse(menuTextarea.value, null);
    const rules = safeJsonParse(rulesTextarea.value, []);
    const settings = safeJsonParse(settingsTextarea.value, { defaultMessage: "", windowSeconds: 86400 });
    const validationError = validateConfig(menu, rules, settings);
    if (validationError) {
      showMessage(validationError, "error");
      return;
    }
    loadToUI(menu, rules, settings);
    showMessage("JSON avançado aplicado");
  }

  async function listSessions() {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (!res.ok) throw new Error("Erro ao listar sessões");
      const data = await res.json();
      renderSessions(data.sessions || []);
    } catch (err) {
      console.error("❌ Erro ao listar sessões:", err);
      showMessage("Erro ao listar sessões", "error");
    }
  }

  async function clearSessions() {
    try {
      const res = await fetch(`${API_BASE}/sessions/clear`, { method: "POST" });
      if (!res.ok) throw new Error("Erro ao limpar sessões");
      await res.json();
      showMessage("Sessões limpas com sucesso");
      renderSessions([]);
    } catch (err) {
      console.error("❌ Erro ao limpar sessões:", err);
      showMessage("Erro ao limpar sessões", "error");
    }
  }

  function setupSocket() {
    const socket = io();
    socket.on("connect", () => {
      socket.emit("joinTenant", { token });
    });
    socket.on("status", (status) => {
      if (!statusChip) return;
      statusChip.textContent = `Status: ${status}`;
      const statusLower = String(status || "").toLowerCase();
      statusChip.classList.remove("status-ready", "status-authenticated", "status-disconnected", "status-waiting");
      if (statusLower.includes("pronto") || statusLower.includes("ready")) {
        statusChip.classList.add("status-ready");
      } else if (statusLower.includes("autentic") || statusLower.includes("authenticated")) {
        statusChip.classList.add("status-authenticated");
      } else if (statusLower.includes("desconect") || statusLower.includes("disconnected")) {
        statusChip.classList.add("status-disconnected");
      } else {
        statusChip.classList.add("status-waiting");
      }
    });
  }

  btnAddBlock?.addEventListener("click", () => {
    uiBlocks.push(createEmptyBlock(`MENU_${uiBlocks.length + 1}`));
    renderBlocks();
    syncAdvanced();
  });
  btnSave?.addEventListener("click", saveConfig);
  btnLoad?.addEventListener("click", loadConfig);
  btnExport?.addEventListener("click", exportConfig);
  btnApplyAdvanced?.addEventListener("click", applyAdvanced);
  btnListSessions?.addEventListener("click", listSessions);
  btnClearSessions?.addEventListener("click", clearSessions);
  fileImport?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importConfig(file);
  });

  setupSocket();
  loadConfig();
  console.log("✅ messages.js carregado");
});
