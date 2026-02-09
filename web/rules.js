function getTokenFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "t") {
    return decodeURIComponent(parts[1]);
  }
  return null;
}

function showToast(type, message) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type === "error" ? "error" : "success"}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button type="button" aria-label="Fechar">×</button>
  `;

  const closeBtn = toast.querySelector("button");
  const remove = () => toast.remove();
  closeBtn.addEventListener("click", remove);

  container.appendChild(toast);
  setTimeout(remove, 3000);
}

function normalizeConfig(payload) {
  if (!payload || typeof payload !== "object") {
    return { menu: {}, rules: [], settings: {} };
  }

  if (payload.menu || payload.rules || payload.settings) {
    return {
      menu: payload.menu || {},
      rules: Array.isArray(payload.rules) ? payload.rules : [],
      settings: payload.settings || {}
    };
  }

  return {
    menu: payload,
    rules: [],
    settings: {}
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLegacyRule(rule, index) {
  const received = rule.received || "";
  let matchType = "equals";
  let matchValue = received;

  if (received.toLowerCase().startsWith("contains:")) {
    matchType = "contains";
    matchValue = received.slice(9).trim();
  } else if (received.toLowerCase().startsWith("regex:^")) {
    matchType = "startsWith";
    matchValue = received.slice(7).trim();
  } else if (received.toLowerCase().startsWith("regex:")) {
    matchType = "equals";
    matchValue = received.slice(6).trim();
  }

  const replyText = rule.reply?.text || rule.sent || "";

  return {
    id: rule.id || `rule_${index}_${Date.now()}`,
    name: rule.name || `Regra ${index + 1}`,
    enabled: rule.enabled !== false,
    matchType: rule.match?.type || matchType,
    matchValue: rule.match?.value || matchValue,
    ignoreCase: rule.match?.ignoreCase ?? true,
    removeAccents: rule.match?.removeAccents ?? true,
    replyText
  };
}

function buildRuleJson(rule) {
  let received = "";
  if (!rule.enabled) {
    received = "regex:(?!)";
  } else if (rule.matchType === "contains") {
    received = `contains:${rule.matchValue}`;
  } else if (rule.matchType === "startsWith") {
    received = `regex:^${escapeRegex(rule.matchValue)}`;
  } else {
    received = rule.matchValue;
  }

  const sent = rule.replyText || "";

  return {
    name: rule.name,
    enabled: rule.enabled,
    match: {
      type: rule.matchType,
      value: rule.matchValue,
      ignoreCase: rule.ignoreCase,
      removeAccents: rule.removeAccents
    },
    reply: {
      text: rule.replyText || ""
    },
    received,
    sent
  };
}

function validateRule(rule) {
  if (!rule.matchValue || !rule.matchValue.trim()) {
    return "Palavra/Frase não pode ser vazia";
  }

  if (!rule.replyText || !rule.replyText.trim()) {
    return "Texto de resposta é obrigatório";
  }

  return null;
}

function labelMatch(rule) {
  const value = (rule.matchValue || "").trim();
  const typeLabel = rule.matchType === "startsWith"
    ? "Começa com"
    : rule.matchType === "equals"
      ? "Igual"
      : "Contém";
  return value ? `${typeLabel}: ${value}` : `${typeLabel}: (vazio)`;
}

function createRuleCard(rule, token, onChange, onRemove) {
  const card = document.createElement("div");
  card.className = "block-card rule-card";

  const header = document.createElement("div");
  header.className = "block-header";
  header.innerHTML = `
    <strong>${rule.name}</strong>
    <div class="option-actions">
      <button class="btn btn-secondary" type="button" data-action="toggle">−</button>
      <button class="btn btn-danger" type="button" data-action="remove">Remover</button>
    </div>
  `;

  header.querySelector("button[data-action='remove']").addEventListener("click", () => onRemove(rule));
  const toggleBtn = header.querySelector("button[data-action='toggle']");

  const body = document.createElement("div");
  body.className = "block-body";
  body.innerHTML = `
    <div class="block-grid">
      <div>
        <label>Nome da regra</label>
        <input type="text" data-field="name" value="${rule.name}" />
      </div>
      <div>
        <label>Status</label>
        <select data-field="enabled">
          <option value="true">Ativa</option>
          <option value="false">Inativa</option>
        </select>
      </div>
    </div>

    <div class="block-grid" style="margin-top:12px;">
      <div>
        <label>Tipo de gatilho</label>
        <select data-field="match-type">
          <option value="contains">Contém</option>
          <option value="startsWith">Começa com</option>
          <option value="equals">Igual</option>
        </select>
      </div>
      <div>
        <label>Palavra-chave / frase</label>
        <input type="text" data-field="match-value" value="${rule.matchValue}" placeholder="Ex: atendente" />
      </div>
    </div>

    <div class="block-grid" style="margin-top:12px;">
      <div>
        <label>Texto de resposta</label>
        <textarea rows="3" data-field="reply-text" class="default-message-input" style="min-height:90px;">${rule.replyText}</textarea>
      </div>
    </div>

    <div class="block-grid" style="margin-top:12px;">
      <div>
        <label>Normalização</label>
        <div class="option-actions">
          <label><input type="checkbox" data-field="ignore-case" /> Ignorar maiúsculas</label>
          <label><input type="checkbox" data-field="remove-accents" /> Remover acentos</label>
        </div>
      </div>
    </div>
  `;

  const summary = document.createElement("div");
  summary.className = "block-summary";
  summary.textContent = `${rule.enabled ? "Ativa" : "Inativa"} • ${labelMatch(rule)}`;

  const nameInput = body.querySelector("[data-field='name']");
  const enabledSelect = body.querySelector("[data-field='enabled']");
  const matchSelect = body.querySelector("[data-field='match-type']");
  const matchInput = body.querySelector("[data-field='match-value']");
  const replyTextarea = body.querySelector("[data-field='reply-text']");
  const ignoreCaseCheckbox = body.querySelector("[data-field='ignore-case']");
  const removeAccentsCheckbox = body.querySelector("[data-field='remove-accents']");

  enabledSelect.value = String(rule.enabled);
  matchSelect.value = rule.matchType;
  ignoreCaseCheckbox.checked = rule.ignoreCase;
  removeAccentsCheckbox.checked = rule.removeAccents;

  function updateSummary() {
    summary.textContent = `${rule.enabled ? "Ativa" : "Inativa"} • ${labelMatch(rule)}`;
  }

  function getCollapseKey() {
    return `ui:rules:collapsed:${token}:${rule.id}`;
  }

  function setCollapsed(collapsed) {
    if (collapsed) {
      card.classList.add("collapsed");
      toggleBtn.textContent = "+";
      localStorage.setItem(getCollapseKey(), "1");
    } else {
      card.classList.remove("collapsed");
      toggleBtn.textContent = "−";
      localStorage.removeItem(getCollapseKey());
    }
  }

  toggleBtn.addEventListener("click", () => {
    const isCollapsed = card.classList.contains("collapsed");
    setCollapsed(!isCollapsed);
  });

  nameInput.addEventListener("input", () => {
    rule.name = nameInput.value;
    header.querySelector("strong").textContent = rule.name || "Regra";
    updateSummary();
    onChange();
  });

  enabledSelect.addEventListener("change", () => {
    rule.enabled = enabledSelect.value === "true";
    updateSummary();
    onChange();
  });

  matchSelect.addEventListener("change", () => {
    rule.matchType = matchSelect.value;
    updateSummary();
    onChange();
  });

  matchInput.addEventListener("input", () => {
    rule.matchValue = matchInput.value;
    updateSummary();
    onChange();
  });

  replyTextarea.addEventListener("input", () => {
    rule.replyText = replyTextarea.value;
    onChange();
  });

  ignoreCaseCheckbox.addEventListener("change", () => {
    rule.ignoreCase = ignoreCaseCheckbox.checked;
    onChange();
  });

  removeAccentsCheckbox.addEventListener("change", () => {
    rule.removeAccents = removeAccentsCheckbox.checked;
    onChange();
  });

  card.appendChild(header);
  card.appendChild(summary);
  card.appendChild(body);

  const initialCollapsed = localStorage.getItem(getCollapseKey()) === "1";
  setCollapsed(initialCollapsed);

  return card;
}

document.addEventListener("DOMContentLoaded", () => {
  const token = getTokenFromPath();
  const API_BASE = "/api/t/" + encodeURIComponent(token || "");

  const botName = document.getElementById("bot-name");
  const btnBack = document.getElementById("btn-back");
  const statusChip = document.getElementById("status-chip");
  const rulesContainer = document.getElementById("rules-container");
  const btnAddRule = document.getElementById("btn-add-rule");
  const btnSaveRules = document.getElementById("btn-save-rules");

  if (!token) {
    showToast("error", "Token ausente na URL");
    return;
  }

  if (botName) botName.textContent = `🤖 Bot do Tenant: ${token}`;
  if (btnBack) btnBack.href = `${window.location.origin}/t/${encodeURIComponent(token)}`;

  let menuCache = {};
  let settingsCache = {};
  let rulesUI = [];

  function renderRules() {
    if (!rulesContainer) return;
    rulesContainer.innerHTML = "";

    rulesUI.forEach((rule, index) => {
      const card = createRuleCard(
        rule,
        token,
        () => {},
        () => {
          rulesUI = rulesUI.filter(r => r !== rule);
          renderRules();
        }
      );
      rulesContainer.appendChild(card);
    });
  }

  function validateAll() {
    const errors = [];
    const map = new Map();

    rulesUI.forEach((rule) => {
      const error = validateRule(rule);
      if (error) {
        errors.push(error);
        map.set(rule.id, error);
      }
    });

    rulesContainer.querySelectorAll(".rule-card").forEach((card, idx) => {
      const rule = rulesUI[idx];
      if (map.has(rule.id)) {
        card.classList.add("error");
      } else {
        card.classList.remove("error");
      }
    });

    return { ok: errors.length === 0, message: errors[0] };
  }

  async function loadConfig() {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (!res.ok) throw new Error("Erro ao carregar config");
      const payload = await res.json();
      const normalized = normalizeConfig(payload);

      menuCache = normalized.menu || {};
      settingsCache = normalized.settings || {};
      rulesUI = (normalized.rules || []).map(parseLegacyRule);
      if (rulesUI.length === 0) {
        rulesUI = [parseLegacyRule({ received: "", sent: "" }, 0)];
      }

      renderRules();
      showToast("success", "Regras carregadas");
    } catch (err) {
      console.error(err);
      showToast("error", "Erro ao carregar regras");
    }
  }

  async function saveRules() {
    const validation = validateAll();
    if (!validation.ok) {
      showToast("error", validation.message || "Erro de validação");
      return;
    }

    try {
      const rulesJson = rulesUI.map(buildRuleJson);
      const res = await fetch(`${API_BASE}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menu: menuCache,
          rules: rulesJson,
          settings: settingsCache
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Erro ao salvar regras");
      }

      showToast("success", "Regras salvas com sucesso");
    } catch (err) {
      console.error(err);
      showToast("error", err?.message || "Erro ao salvar regras");
    }
  }

  function setupSocket() {
    const socket = io();
    socket.on("connect", () => socket.emit("joinTenant", { token }));
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

  btnAddRule?.addEventListener("click", () => {
    rulesUI.push(parseLegacyRule({ received: "", sent: "" }, rulesUI.length));
    renderRules();
  });

  btnSaveRules?.addEventListener("click", saveRules);

  setupSocket();
  loadConfig();
});
