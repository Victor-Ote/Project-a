const socket = io();

const qrContainer = document.getElementById("qr-container");
const statusText = document.getElementById("status-text");

// Receber QR code
socket.on("qr", (data) => {
  console.log("📲 QR code recebido");
  qrContainer.innerHTML = `<img src="${data.dataUrl}" alt="QR Code" class="qr-image">`;
});

// Receber status
socket.on("status", (data) => {
  console.log("📊 Status:", data.status);
  statusText.textContent = `Status: ${data.message}`;
  
  // Mudar cor do status
  const statusElement = statusText.parentElement;
  statusElement.classList.remove("status-waiting", "status-authenticated", "status-ready", "status-disconnected");
  
  if (data.status === "waiting_qr") {
    statusElement.classList.add("status-waiting");
  } else if (data.status === "authenticated") {
    statusElement.classList.add("status-authenticated");
  } else if (data.status === "ready") {
    statusElement.classList.add("status-ready");
  } else if (data.status === "disconnected") {
    statusElement.classList.add("status-disconnected");
  }
});

console.log("✅ index.js carregado");
