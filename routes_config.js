// Rotas de config que devem ser adicionadas após a seção "// ROTAS: API"
// e antes de "// API REST: GET RULES"

// =====================================
// API REST: MULTI-TENANT CONFIG
// =====================================
app.get("/t/:token/config", (req, res) => {
  try {
    const result = getTenantFromRequest(req);
    if (result.error) {
      return res.status(result.statusCode || 400).json(result);
    }
    const tenant = getOrCreateTenantByToken(result.token);
    console.log("[API] GET config:", tenant.tenantId);
    res.json(tenant.config);
  } catch (err) {
    console.error("❌ Erro ao obter config:", err.message);
    res.status(500).json({ error: "Erro ao obter config" });
  }
});

app.put("/t/:token/config", (req, res) => {
  try {
    const result = getTenantFromRequest(req);
    if (result.error) {
      return res.status(result.statusCode || 400).json(result);
    }
    
    const body = req.body;
    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      return res.status(400).json({ error: "Body deve ser um objeto válido" });
    }
    
    const tenant = getOrCreateTenantByToken(result.token);
    tenant.config = body;
    dbUpsertConfig(result.token, body);
    
    console.log("[API] PUT config:", tenant.tenantId);
    console.log("[CONFIG] Runtime atualizado para tenant:", tenant.tenantId);
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Erro ao atualizar config:", err.message);
    res.status(500).json({ error: "Erro ao atualizar config" });
  }
});
