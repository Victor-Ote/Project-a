document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ index.js carregado + DOM pronto");

  // Extrair token da URL (/t/:token)
  const pathname = window.location.pathname;
  let token = null;
  
  if (pathname.startsWith("/t/")) {
    token = pathname.split("/t/")[1];
    console.log("[FRONT] token extraído da URL:", token);
  }

  if (!token) {
    console.error("❌ [FRONT] Nenhum token encontrado na URL");
    document.getElementById("status-text").textContent = "Erro: token ausente";
    return;
  }

  // Criar socket com token na query string
  const socket = io({
    query: { token }
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

  socket.on("connect", () => console.log("🟢 [FRONT] socket conectado:", socket.id, "token=", token));
  socket.on("disconnect", (r) => console.log("🔴 [FRONT] socket desconectado:", r));
});
