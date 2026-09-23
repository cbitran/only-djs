import { supabase, supabaseConfigured } from "./supabase-client.js";
import { resolveLoginDestination, requestPasswordRecovery } from "./login-actions.js";

const form = document.querySelector("#login-form");
const status = document.querySelector("#auth-status");
const submit = form.querySelector("button[type=submit]");

function announce(message, isError = false) {
  status.textContent = message;
  status.dataset.error = String(isError);
}

if (!supabaseConfigured) {
  announce("Prévia local: conecte um projeto Supabase Only DJs para ativar o login.");
} else if (!supabase) {
  announce("Configuração bloqueada: confira se a referência e a URL são do mesmo projeto Supabase.", true);
}

if (["localhost", "127.0.0.1"].includes(location.hostname)) {
  document.querySelector("#local-preview-link").hidden = false;
}

const params = new URLSearchParams(location.search);
if (params.has("password_updated")) announce("Senha atualizada. Entre com seu e-mail e a nova senha.");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return announce("Login indisponível: falta configurar o projeto Only DJs.", true);
  submit.disabled = true;
  announce("Verificando acesso…");

  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  try {
    const destination = await resolveLoginDestination(supabase, email, password);
    if (destination === "admin") return location.replace("admin.html");
    if (destination === "student") return location.replace("student.html");

    const messages = {
      credentials: "Não foi possível entrar. Confira seus dados ou peça um novo convite.",
      inactive: "Sua conta ainda não está ativa. Use o convite recebido ou fale com a escola.",
      unavailable: "Não foi possível verificar seu acesso agora. Confira sua conexão e tente novamente.",
    };
    announce(messages[destination] || messages.unavailable, true);
  } catch {
    announce("Não foi possível verificar seu acesso agora. Confira sua conexão e tente novamente.", true);
  } finally {
    submit.disabled = false;
  }
});

const recoveryButton = document.querySelector("#forgot-password");
recoveryButton.addEventListener("click", async () => {
  const email = form.elements.email.value.trim();
  if (!supabase) return announce("A recuperação será ativada quando o projeto Only DJs estiver configurado.", true);
  if (!email) return announce("Digite seu e-mail primeiro para receber a recuperação.", true);
  recoveryButton.disabled = true;
  announce("Enviando solicitação…");
  try {
    const result = await requestPasswordRecovery(
      supabase,
      email,
      `${location.origin}/portal/accept-invite.html?flow=recovery`,
    );
    announce(result === "sent"
      ? "Se esse e-mail estiver cadastrado, você receberá as instruções de recuperação."
      : "Não foi possível enviar a recuperação agora. Tente novamente mais tarde.", result !== "sent");
  } finally {
    recoveryButton.disabled = false;
  }
});
