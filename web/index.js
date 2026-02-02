document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ index.js carregado + DOM pronto");

  const socket = io();

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

  socket.on("connect", () => console.log("🟢 [FRONT] socket conectado:", socket.id));
  socket.on("disconnect", (r) => console.log("🔴 [FRONT] socket desconectado:", r));
});
