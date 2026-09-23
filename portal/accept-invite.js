import { supabase, supabaseConfigured } from "./supabase-client.js";
import { completeAccessSetup } from "./invite-activation.js";

const form = document.querySelector("#password-form");
const status = document.querySelector("#password-status");
const button = form.querySelector("button[type=submit]");
const retryButton = document.querySelector("#retry-activation");
const isRecovery = new URLSearchParams(location.search).get("flow") === "recovery";
document.querySelector("#flow-label").textContent = isRecovery ? "RECUPERAÇÃO DE ACESSO" : "CONVITE À ESCOLA";

function announce(message, error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}

let hasSession = false;
let sessionUserId = "";
if (supabaseConfigured && supabase) {
  const { data } = await supabase.auth.getSession();
  hasSession = Boolean(data.session);
  sessionUserId = data.session?.user?.id || "";
}
const activationPendingKey = sessionUserId ? `only-djs-invite-activation:${sessionUserId}` : "";
function rememberPendingActivation(pending) {
  if (!activationPendingKey) return;
  try {
    if (pending) sessionStorage.setItem(activationPendingKey, "1");
    else sessionStorage.removeItem(activationPendingKey);
  } catch { /* The current page still keeps the retry action available. */ }
}
function hasRememberedPendingActivation() {
  if (!activationPendingKey) return false;
  try { return sessionStorage.getItem(activationPendingKey) === "1"; }
  catch { return false; }
}
if (!supabaseConfigured) announce("O acesso ainda não está conectado a uma base Only DJs.", true);
else if (!supabase) announce("Configuração bloqueada: confira se a referência e a URL são do mesmo projeto Supabase.", true);
else if (!hasSession) announce("Link inválido ou expirado. Peça à escola um novo convite.", true);
else if (!isRecovery && hasRememberedPendingActivation()) {
  retryButton.hidden = false;
  announce("Sua senha já foi salva. Falta concluir a ativação; você pode tentar novamente abaixo.", true);
}
else announce("Link confirmado. Escolha sua senha.");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !hasSession) return announce("Abra o link recebido por e-mail para continuar.", true);
  const password = form.elements.password.value;
  if (password !== form.elements.confirmPassword.value) return announce("As senhas não coincidem.", true);
  button.disabled = true;
  announce("Salvando sua senha…");
  const result = await completeAccessSetup({
    isRecovery,
    updatePassword: () => supabase.auth.updateUser({ password }),
    invokeActivation: () => supabase.functions.invoke("activate-invited-student"),
    checkIsAdmin: async () => {
      const { data, error } = await supabase.rpc("is_current_user_admin");
      if (error) throw error;
      return data === true;
    },
  });
  if (result === "password-error") {
    button.disabled = false;
    return announce("Não foi possível salvar a senha. Confira os requisitos e tente de novo.", true);
  }

  if (result === "recovery-saved") {
    location.replace("login.html?password_updated=1");
    return;
  }
  if (result === "admin-saved") {
    location.replace("admin.html");
    return;
  }
  if (result === "activation-pending") {
    rememberPendingActivation(true);
    retryButton.hidden = false;
    button.disabled = false;
    return announce("Senha salva, mas a ativação não concluiu. Tente novamente sem redefinir a senha.", true);
  }
  rememberPendingActivation(false);
  location.replace("student.html");
});

retryButton.addEventListener("click", async () => {
  if (!supabase || !hasSession || isRecovery) return announce("Abra o convite recebido por e-mail para continuar.", true);
  retryButton.disabled = true;
  announce("Tentando concluir a ativação…");
  const result = await completeAccessSetup({
    isRecovery: false,
    updatePassword: async () => ({ error: null }),
    checkIsAdmin: async () => {
      const { data, error } = await supabase.rpc("is_current_user_admin");
      if (error) throw error;
      return data === true;
    },
    invokeActivation: () => supabase.functions.invoke("activate-invited-student"),
  });
  if (result === "admin-saved") {
    location.replace("admin.html");
    return;
  }
  if (result !== "activated") {
    retryButton.disabled = false;
    return announce("Ainda não foi possível ativar. Você pode tentar novamente; sua senha já está salva.", true);
  }
  rememberPendingActivation(false);
  location.replace("student.html");
});
