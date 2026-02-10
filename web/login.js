const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("login-button");
const errorMessage = document.getElementById("error-message");

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add("show");
}

function hideError() {
  errorMessage.textContent = "";
  errorMessage.classList.remove("show");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError("Por favor, preencha todos os campos");
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "Entrando...";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      showError(data.error || "Erro ao fazer login");
      loginButton.disabled = false;
      loginButton.textContent = "Entrar";
      return;
    }

    // Redirecionar
    if (data.redirect) {
      window.location.href = data.redirect;
    } else if (data.token) {
      window.location.href = `/t/${data.token}`;
    } else {
      window.location.href = "/";
    }
  } catch (err) {
    console.error("Erro ao fazer login:", err);
    showError("Erro de conexão. Tente novamente.");
    loginButton.disabled = false;
    loginButton.textContent = "Entrar";
  }
});
