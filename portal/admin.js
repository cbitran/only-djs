import { supabase, supabaseConfigured } from "./supabase-client.js";
import { invokeAdminAction } from "./admin-actions.js";
import { setStudentChapterAccess } from "./admin-chapter-access.js";
import { verifyAdminSession } from "./admin-session.js";

const status = document.querySelector("#admin-status");
const form = document.querySelector("#admin-invite-form");
const submit = form.querySelector("button[type=submit]");
const chapterChoices = document.querySelector("#chapter-choices");
const roster = document.querySelector("#student-roster");
const ui = { adminId: null, chapters: [] };
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

function announce(message, error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}

document.querySelector("#admin-logout").addEventListener("click", async (event) => {
  event.preventDefault();
  if (supabase) await supabase.auth.signOut();
  location.replace("login.html");
});

async function loadRoster() {
  const [{ data: profiles, error: profileError }, { data: grants, error: grantError }] = await Promise.all([
    supabase.from("profiles").select("id,email,display_name,status,created_at").order("created_at", { ascending: false }),
    supabase.from("student_chapter_access").select("student_id,chapter_id"),
  ]);
  if (profileError || grantError) {
    roster.innerHTML = "<p class=\"auth-status\" data-error=\"true\">Não foi possível carregar a lista de alunos.</p>";
    return;
  }
  const students = profiles || [];
  document.querySelector("#active-count").textContent = String(students.filter((student) => student.status === "active").length).padStart(2, "0");
  document.querySelector("#invite-count").textContent = String(students.filter((student) => student.status === "invited").length).padStart(2, "0");
  document.querySelector("#chapter-count").textContent = String(ui.chapters.filter((chapter) => chapter.published).length).padStart(2, "0");
  if (!students.length) {
    roster.innerHTML = "<p class=\"roster-empty\">Ainda não há alunos cadastrados. Envie o primeiro convite acima.</p>";
    return;
  }

  const accessRows = grants || [];
  roster.innerHTML = students.map((student) => {
    const studentGrants = accessRows.filter((grant) => grant.student_id === student.id);
    const statusLabel = { invited: "CONVITE PENDENTE", active: "ATIVO", suspended: "SUSPENSO" }[student.status] || "—";
    const nextStatus = student.status === "active" ? "suspended" : "active";
    const actionLabel = student.status === "active" ? "SUSPENDER" : "REATIVAR";
    const chapters = ui.chapters.map((chapter) => {
      const checked = studentGrants.some((grant) => grant.chapter_id === chapter.id);
      return `<label><input type="checkbox" data-grant data-student="${escapeHtml(student.id)}" data-chapter="${escapeHtml(chapter.id)}" ${checked ? "checked" : ""}><span>${String(chapter.number).padStart(2, "0")} · ${escapeHtml(chapter.title)}</span></label>`;
    }).join("");
    return `<article class="roster-card" data-student-card="${escapeHtml(student.id)}">
      <div class="roster-head"><div><span class="mono roster-status ${student.status}">${statusLabel}</span><h3>${escapeHtml(student.display_name || "Aluno")}</h3><a href="mailto:${escapeHtml(student.email)}">${escapeHtml(student.email)}</a></div>
      <button type="button" class="outline mono" data-set-status="${nextStatus}" data-student="${escapeHtml(student.id)}" ${student.status === "invited" ? "disabled" : ""}>${student.status === "invited" ? "AGUARDANDO ACEITE" : actionLabel}</button></div>
      <details><summary class="mono">CAPÍTULOS LIBERADOS · ${studentGrants.length}/${ui.chapters.length}</summary><div class="roster-chapters">${chapters || "<span>Nenhum capítulo cadastrado.</span>"}</div></details>
    </article>`;
  }).join("");
}

async function startAdmin() {
  if (!supabaseConfigured || !supabase) {
    if (supabaseConfigured && !supabase) {
      announce("Configuração bloqueada: confira se a referência e a URL são do mesmo projeto Supabase.", true);
      submit.disabled = true;
      return;
    }
    announce("Prévia da área admin. Configure o projeto Only DJs para gerenciar acessos reais.");
    submit.disabled = true;
    return;
  }
  const access = await verifyAdminSession(supabase);
  if (access.status === "unauthenticated") return location.replace("login.html");
  if (access.status === "denied") return location.replace("login.html?access=denied");
  if (access.status !== "admin") {
    announce("Não foi possível validar sua sessão. Confira a conexão e tente novamente.", true);
    submit.disabled = true;
    return;
  }
  ui.adminId = access.userId;

  const { data: chapters, error: chapterError } = await supabase
    .from("chapters").select("id,number,title,published").order("number");
  if (chapterError) {
    announce("Não foi possível carregar os capítulos.", true);
    return;
  }
  ui.chapters = chapters || [];
  chapterChoices.innerHTML = ui.chapters.map((chapter) => `
    <label><input type="checkbox" name="chapterIds" value="${escapeHtml(chapter.id)}">
    <span>${String(chapter.number).padStart(2, "0")} · ${escapeHtml(chapter.title)}</span></label>
  `).join("") || "<span>Nenhum capítulo cadastrado ainda.</span>";
  document.querySelectorAll("[data-auth-only]").forEach((element) => element.hidden = false);
  await loadRoster();
  announce("Acesso admin verificado.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return announce("Convites reais indisponíveis sem a configuração Supabase.", true);
  submit.disabled = true;
  announce("Enviando convite…");
  const chapterIds = [...form.querySelectorAll('input[name="chapterIds"]:checked')]
    .map((input) => input.value);
  try {
    const { data, error } = await invokeAdminAction(supabase, "admin-invite-student", {
      email: form.elements.email.value.trim(),
      displayName: form.elements.displayName.value.trim(),
      chapterIds,
    });
    if (error || !data?.invited) {
      announce(data?.error || "Não foi possível enviar o convite. Confira a conexão e tente novamente.", true);
      return;
    }
    form.reset();
    await loadRoster();
    announce("Convite enviado. O acesso ficará pendente até a pessoa definir a senha.");
  } catch {
    announce("Não foi possível enviar o convite. Confira a conexão e tente novamente.", true);
  } finally {
    submit.disabled = false;
  }
});

roster.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-set-status]");
  if (!button || !supabase) return;
  button.disabled = true;
  try {
    const { data, error } = await invokeAdminAction(supabase, "admin-set-student-status", {
      studentId: button.dataset.student,
      status: button.dataset.setStatus,
    });
    if (error || !data?.status) {
      announce("Não foi possível alterar o acesso. Tente novamente.", true);
      return;
    }
    await loadRoster();
    announce(data.status === "suspended" ? "Acesso suspenso." : "Acesso reativado.");
  } catch {
    announce("Não foi possível alterar o acesso. Confira sua conexão e tente novamente.", true);
  } finally {
    button.disabled = false;
  }
});

roster.addEventListener("change", async (event) => {
  const checkbox = event.target.closest("[data-grant]");
  if (!checkbox || !supabase) return;
  checkbox.disabled = true;
  const studentId = checkbox.dataset.student;
  const chapterId = checkbox.dataset.chapter;
  const requestedGrant = checkbox.checked;
  try {
    const saved = await setStudentChapterAccess(supabase, studentId, chapterId, ui.adminId, requestedGrant);
    if (!saved) {
      checkbox.checked = !requestedGrant;
      announce("Não foi possível atualizar a permissão. Verifique a conexão e tente novamente.", true);
      return;
    }
    try {
      await loadRoster();
      announce("Permissões de capítulos atualizadas.");
    } catch {
      announce("Permissão salva, mas a lista não atualizou. Recarregue para conferir.", true);
    }
  } finally {
    checkbox.disabled = false;
  }
});

startAdmin().catch(() => {
  announce("Não foi possível carregar a área administrativa. Confira a conexão e recarregue a página.", true);
  submit.disabled = true;
});
