function getTokenFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "t") {
    return decodeURIComponent(parts[1]);
  }
  return null;
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ index.js carregado + DOM pronto");

  const token = getTokenFromPath();
  console.log("[FRONT] token extraído da URL:", token);

  if (!token) {
    console.error("❌ [FRONT] Nenhum token encontrado na URL");
    const statusText = document.getElementById("status-text");
    if (statusText) statusText.textContent = "Erro: token ausente";
    return;
  }

  const manageLink = document.getElementById("manage-messages-link");
  if (manageLink) {
    manageLink.href = `/t/${encodeURIComponent(token)}/messages`;
  }

  // Criar socket e entrar no tenant
  const socket = io();
  socket.on("connect", () => {
    console.log("🟢 [FRONT] socket conectado:", socket.id, "token=", token);
    socket.emit("joinTenant", { token });
  });

  const qrContainer = document.getElementById("qr-container");
  const statusText = document.getElementById("status-text");

  if (!qrContainer) console.error("❌ #qr-container não encontrado");
  if (!statusText) console.error("❌ #status-text não encontrado");

  socket.on("qr", (payload) => {
    console.log("📥 [FRONT] payload qr:", payload);

    const dataUrl =
      typeof payload === "string"
        ? payload
        : payload?.qr || payload?.dataUrl || payload?.src;

    if (!dataUrl || typeof dataUrl !== "string") {
      console.warn("⚠️ [FRONT] QR inválido, dataUrl ausente");
      return;
    }

    if (!dataUrl.startsWith("data:image")) {
      console.warn("⚠️ [FRONT] QR não é data:image:", dataUrl.slice(0, 30));
      return;
    }

    if (!qrContainer) return;

    qrContainer.innerHTML = `<img id="qrImage" src="${dataUrl}" alt="QR Code" />`;
    if (statusText) statusText.textContent = "Status: QR code recebido";

    console.log("✅ [FRONT] QR injetado no #qr-container");
  });

  socket.on("status", (status) => {
    console.log("📥 [FRONT] status:", status);
    if (statusText) statusText.textContent = `Status: ${status}`;
  });

  socket.on("disconnect", (r) => console.log("🔴 [FRONT] socket desconectado:", r));
});
