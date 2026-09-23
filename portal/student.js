import { supabase, supabaseConfigured } from './supabase-client.js';
import { createStudentPreviewStore } from './student-preview-store.js';
import { createStudentAvatarStore } from './student-avatar-store.js';
import { isLocalCoursePreviewHost, isLocalStudentPreviewMode } from './student-preview-mode.js';
import { submitConnectedQuiz } from './student-quiz-actions.js';
import { saveStudentProgress } from './student-account-actions.js';
import { copyStudentInvitation, getStudentInvitationUrl, shareStudentInvitation } from './student-invite-share.js';
import { renderSourceList, safeHttpUrl } from './content-url.js';
import { createNavigationPreferences, selectResumeChapter } from './student-navigation-state.js';
import { createStudentProfileService } from './student-profile-service.js';
import { createQuizStepper } from './quiz-stepper.js';
import { CHAPTER_SECTION_KEYS, chapterProgressPercent, recordChapterSection } from './chapter-progress.js';
import { lessonCompletionControlMarkup } from './lesson-completion-control.js';

(() => {
  const localPreviewMode = isLocalStudentPreviewMode(window.location.hostname, window.location.search);
  const activeSupabase = localPreviewMode ? null : supabase;
  const activeSupabaseConfigured = !localPreviewMode && supabaseConfigured;
  const ui = { chapters: [], current: 0, tab: 'entenda', completed: new Set(), started: new Set(), completedSections: new Map(), score: 0, answered: new Set(), quizScores: new Map(), avatarUrl: null, avatarPath: null, userId: null };
  const quizFlows = new Map();
  let previewStore = null;
  const avatarStore = !activeSupabaseConfigured ? createStudentAvatarStore() : null;
  let savedPreview = null;
  let profileDraft = { name: '', email: '', phone: '', instagram: '', social: '' };
  let resumeIndex = 0;
  let hasResumeHistory = false;
  let connectedProgress = [];
  let navigationPreferences;
  if (!activeSupabaseConfigured) {
    try { previewStore = createStudentPreviewStore(window.localStorage); }
    catch { previewStore = createStudentPreviewStore(null); }
    savedPreview = previewStore.load();
    profileDraft = { name: savedPreview.name, email: savedPreview.email, phone: savedPreview.phone, instagram: savedPreview.instagram, social: savedPreview.social };
    ui.current = savedPreview.current;
    ui.completed = new Set(savedPreview.completed);
    ui.started = new Set(savedPreview.started);
    ui.completedSections = new Map(Object.entries(savedPreview.chapterSections).map(([index, sections]) => [Number(index), sections]));
    ui.score = savedPreview.score;
    ui.answered = new Set(savedPreview.answered);
  }
  try { navigationPreferences = createNavigationPreferences(window.localStorage); }
  catch { navigationPreferences = createNavigationPreferences(null); }
  const navigationState = navigationPreferences.load();
  const profileService = createStudentProfileService({ previewStore, avatarStore });
  if (localPreviewMode) {
    document.querySelectorAll('a[href^="profile.html"]').forEach(link => {
      const target = new URL(link.href);
      target.search = window.location.search;
      link.href = target.href;
    });
  }
  const list = document.querySelector('#chapter-list');
  const panel = document.querySelector('#lesson-panel');
  const shell = document.querySelector('.student-shell');
  const courseLayout = document.querySelector('.course-layout');
  const $ = (selector, root = document) => root.querySelector(selector);
  const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tabs = [['entenda', 'ENTENDA'], ['veja', 'VEJA'], ['pratique', 'PRATIQUE'], ['evite', 'EVITE'], ['testeSe', 'TESTE-SE'], ['duvida', 'TIRE SUA DÚVIDA'], ['fontes', 'FONTES']];
  function quizFlowFor(chapter, questions) {
    let flow = quizFlows.get(chapter.id);
    if (!flow || flow.responses.length !== questions.length) {
      flow = createQuizStepper(questions.length);
      quizFlows.set(chapter.id, flow);
    }
    return flow;
  }
  shell.classList.toggle('sidebar-collapsed', navigationState.sidebarCollapsed);
  courseLayout.classList.toggle('chapter-list-collapsed', navigationState.chapterListCollapsed);
  $('#sidebar-toggle').setAttribute('aria-expanded', String(!navigationState.sidebarCollapsed));
  $('#sidebar-toggle').setAttribute('aria-label', navigationState.sidebarCollapsed ? 'Expandir menu' : 'Recolher menu');
  $('#sidebar-toggle').textContent = navigationState.sidebarCollapsed ? '›' : '‹';
  $('#chapter-list-toggle').setAttribute('aria-expanded', String(!navigationState.chapterListCollapsed));
  $('#chapter-list-toggle').setAttribute('aria-label', navigationState.chapterListCollapsed ? 'Expandir lista de capítulos' : 'Recolher lista de capítulos');
  $('#chapter-list-toggle').title = navigationState.chapterListCollapsed ? 'Expandir lista de capítulos' : 'Recolher lista de capítulos';
  $('#chapter-list-toggle').textContent = navigationState.chapterListCollapsed ? '›' : '‹';
  $('#chapter-list').hidden = false;
  $('#chapter-list').style.display = '';

  function normalize(chapter) {
    const s = chapter.sections || chapter;
    const wrap = (data, title, listKey) => {
      if (typeof data === 'string') return { title, body: data };
      if (Array.isArray(data)) return { title, [listKey]: data };
      return data || { title, body: 'Conteúdo em preparação para validação.' };
    };
    let quiz = s.testeSe || [];
    if (!Array.isArray(quiz)) quiz = quiz.questions || [];
    const questions = quiz.map(q => ({ question: q.pergunta || q.question, options: q.opcoes || q.options || [], correctIndex: Number.isInteger(q.correta) ? q.correta : Math.max(0, (q.opcoes || q.options || []).indexOf(q.resposta_correta || q.answer)), explanation: q.justificativa || q.explanation || '' }));
    const sources = chapter.sources || s.fontes || [];
    const doubt = s.duvida || {};
    return {
      ...chapter,
      summary: chapter.summary || chapter.objective || '',
      theoryMinutes: chapter.theoryMinutes ?? chapter.tempo?.teoria_minutos ?? 0,
      practiceMinutes: chapter.practiceMinutes ?? chapter.tempo?.pratica_minutos ?? 0,
      sections: {
        entenda: wrap(s.entenda, 'A ideia principal', 'items'),
        veja: wrap(s.veja, 'Observe', 'items'),
        pratique: wrap(s.pratique, 'Mão na massa', 'steps'),
        evite: wrap(s.evite, 'Um cuidado importante', 'items'),
        testeSe: { questions },
        duvida: typeof doubt === 'string' ? { question: 'Uma dúvida comum', answer: doubt } : doubt,
        fontes: sources.map(source => typeof source === 'string'
          ? { title: safeHttpUrl(source) ? new URL(source).hostname : 'Fonte sem link seguro', url: source }
          : source)
      }
    };
  }
  const chapterHours = chapter => ((chapter.theoryMinutes || 0) + (chapter.practiceMinutes || 0)) / 60;
  function showToast(message) {
    const toast = $('#preview-toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 4200);
  }
  function chapterState(index) {
    if (ui.completed.has(index)) return ['done', 'VISTO'];
    if (ui.started.has(index)) return ['next', 'EM ANDAMENTO'];
    return ['pending', 'NÃO INICIADA'];
  }
  function chapterSections(index) { return ui.completedSections.get(index) || []; }
  function recordSection(index, key, options) {
    ui.completedSections.set(index, recordChapterSection(chapterSections(index), key, options));
  }
  function chapterPercent(index) { return chapterProgressPercent(chapterSections(index), ui.completed.has(index)); }
  function renderList() {
    list.innerHTML = ui.chapters.map((chapter, index) => {
      const [stateClass, stateLabel] = chapterState(index);
      const percent = chapterPercent(index);
      return `<button type="button" class="chapter-link ${index === ui.current ? 'selected' : ''}" data-chapter="${index}" aria-label="Capítulo ${String(index + 1).padStart(2, '0')}: ${escape(chapter.title)} — ${stateLabel} — ${percent}% concluído" title="${escape(chapter.title)}"><span class="chapter-number">${String(index + 1).padStart(2, '0')}</span><span class="chapter-copy"><span class="chapter-title">${escape(chapter.title)}</span><span class="chapter-state ${stateClass}">${stateLabel}</span></span><span class="chapter-progress-percent mono">${percent}%</span><span class="chapter-progress-bar" role="progressbar" aria-label="Progresso do capítulo ${String(index + 1).padStart(2, '0')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></span></button>`;
    }).join('');
  }
  function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours ? `${hours}h` : ''}${hours && remainder ? ' ' : ''}${remainder ? `${remainder} min` : ''}`;
  }
  function renderBlock(key, data) {
    if (key === 'testeSe') {
      const questions = data.questions || [];
      if (!questions.length) return '<p>As perguntas deste capítulo ainda estão sendo preparadas.</p>';
      const flow = quizFlowFor(ui.chapters[ui.current], questions);
      const index = flow.currentIndex;
      const question = questions[index];
      const percent = Math.round((index + 1) / questions.length * 100);
      return `<section class="quiz-stepper" aria-label="Pergunta ${index + 1} de ${questions.length}"><div class="quiz-step-head mono"><span>PERGUNTA ${String(index + 1).padStart(2, '0')}</span><span>DE ${String(questions.length).padStart(2, '0')}</span></div><div class="quiz-step-track" role="progressbar" aria-label="Progresso do questionário" aria-valuemin="0" aria-valuemax="${questions.length}" aria-valuenow="${index + 1}"><i style="width:${percent}%"></i></div><fieldset class="quiz-question" data-question="${ui.current}-${index}"><legend>${index + 1}. ${escape(question.question)}</legend>${question.options.map((choice, oi) => `<label class="quiz-option"><input type="radio" name="q-${ui.current}-${index}" value="${oi}" ${flow.responses[index] === oi ? 'checked' : ''}><span>${escape(choice)}</span></label>`).join('')}</fieldset><div class="quiz-step-actions"><button class="quiz-back mono" type="button" data-quiz-prev ${index === 0 ? 'disabled' : ''}>← ANTERIOR</button><button class="lesson-primary quiz-next" type="button" data-quiz-next>${index === questions.length - 1 ? 'CONFERIR RESPOSTAS' : 'PRÓXIMA PERGUNTA →'}</button></div><p class="quiz-result" id="quiz-feedback" role="status" hidden></p></section>`;
    }
    if (key === 'duvida') return `<h3>${escape(data.question || 'Uma dúvida comum')}</h3><p>${escape(data.answer || '')}</p>`;
    if (key === 'fontes') return renderSourceList(data);
    const title = data.title || ({ entenda: 'A ideia principal', veja: 'Observe', pratique: 'Mão na massa', evite: 'Um cuidado importante' }[key]);
    const items = data.steps || data.items || [];
    return `<h3>${escape(title)}</h3>${data.body ? `<p>${escape(data.body)}</p>` : ''}${items.length ? `<${data.steps ? 'ol' : 'ul'}>${items.map(item => `<li>${escape(item)}</li>`).join('')}</${data.steps ? 'ol' : 'ul'}>` : ''}${data.tip ? `<p class="lesson-callout">${escape(data.tip)}</p>` : ''}`;
  }
  function updateStats() {
    const done = ui.completed.size;
    const percent = Math.round(done / Math.max(ui.chapters.length, 1) * 100);
    $('#progress-count').innerHTML = `${String(percent).padStart(2, '0')}<span>%</span>`;
    $('#progress-fill').style.width = `${percent}%`;
    $('#lesson-seen-count').textContent = `${done} ${done === 1 ? 'aula vista' : 'aulas vistas'}`;
    $('#points-count').textContent = String(ui.score).padStart(3, '0');
    const resumeButton = $('[data-resume-course]');
    resumeButton.innerHTML = `${hasResumeHistory ? 'CONTINUAR DE ONDE PAROU' : 'COMEÇAR A TRILHA'} <span aria-hidden="true">→</span>`;
    const hours = [...ui.completed].reduce((sum, i) => sum + chapterHours(ui.chapters[i]), 0);
    const hourLabel = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace('.', ',');
    $('.overview-hours>p').innerHTML = `${hourLabel} h de aula marcada como vista <span>· ${activeSupabase && ui.userId ? 'conta conectada' : 'prévia local'}</span>`;
    list.querySelectorAll('.chapter-link').forEach((button, i) => {
      const state = $('.chapter-state', button);
      const [stateClass, stateLabel] = chapterState(i);
      state.textContent = stateLabel;
      state.className = `chapter-state ${stateClass}`;
      button.classList.toggle('selected', i === ui.current);
      const percent = chapterPercent(i);
      button.setAttribute('aria-label', `Capítulo ${String(i + 1).padStart(2, '0')}: ${ui.chapters[i].title} — ${stateLabel} — ${percent}% concluído`);
      $('.chapter-progress-percent', button).textContent = `${percent}%`;
      const progressBar = $('.chapter-progress-bar', button);
      progressBar.setAttribute('aria-valuenow', String(percent));
      $('i', progressBar).style.width = `${percent}%`;
    });
    const completeButton = $('[data-mark-complete]', panel);
    if (completeButton) {
      const completed = ui.completed.has(ui.current);
      completeButton.outerHTML = lessonCompletionControlMarkup(completed);
    }
  }
  function savePreviewState() {
    if (!previewStore) return false;
    const saved = profileService.savePreview({
      ...profileDraft, current: ui.current,
      started: [...ui.started], completed: [...ui.completed],
      chapterSections: Object.fromEntries([...ui.completedSections].map(([index, sections]) => [index, sections])),
      score: ui.score, answered: [...ui.answered],
    });
    if (!saved) showToast('O navegador não permitiu salvar a prévia. Verifique o espaço disponível.');
    return saved;
  }
  function renderLesson() {
    const chapter = ui.chapters[ui.current];
    if (!chapter) return;
    const theory = chapter.theoryMinutes, practice = chapter.practiceMinutes;
    const data = chapter.sections[ui.tab];
    panel.innerHTML = `<div class="lesson-meta mono"><span>MÓDULO ${String(ui.current + 1).padStart(2, '0')} / 10 · RASCUNHO</span><span>${Math.round(chapterHours(chapter) * 60)} MIN NO TOTAL</span></div><h2>${escape(chapter.title)}</h2><p class="lesson-summary">${escape(chapter.summary)}</p><div class="lesson-time mono"><div><span>TEORIA / DEMONSTRAÇÃO</span><strong>${formatDuration(theory)}</strong></div><div><span>PRÁTICA / REVISÃO</span><strong>${formatDuration(practice)}</strong></div></div><label class="lesson-section-select mono" for="lesson-section-select">PARTE DA AULA<select id="lesson-section-select" data-lesson-section>${tabs.map(([key, label]) => `<option value="${key}" ${key === ui.tab ? 'selected' : ''}>${label}</option>`).join('')}</select></label><div class="lesson-copy">${renderBlock(ui.tab, data)}</div><div class="lesson-actions">${lessonCompletionControlMarkup(ui.completed.has(ui.current))}<span class="mono">${activeSupabase && ui.userId ? 'PROGRESSO E PONTOS SALVOS NA CONTA' : 'PRÉVIA SALVA SÓ NESTE NAVEGADOR'}</span></div>`;
    updateStats();
  }
  list.addEventListener('click', async event => {
    const button = event.target.closest('[data-chapter]');
    if (!button) return;
    const previousCurrent = ui.current;
    const index = Number(button.dataset.chapter);
    const wasStarted = ui.started.has(index);
    ui.current = index; ui.tab = 'entenda'; ui.started.add(index); recordSection(index, 'entenda');
    renderList(); renderLesson();
    if (!await persistProgress(index)) {
      ui.current = previousCurrent;
      if (!wasStarted) ui.started.delete(index);
      renderList(); renderLesson();
    }
  });
  panel.addEventListener('change', async event => {
    if (event.target.matches('[data-lesson-section]')) {
      const index = ui.current;
      const before = chapterSections(index);
      ui.tab = event.target.value;
      if (ui.tab !== 'testeSe') recordSection(index, ui.tab);
      renderList(); renderLesson();
      if (ui.tab !== 'testeSe' && !await persistProgress(index)) {
        ui.completedSections.set(index, before);
        renderList(); renderLesson();
      }
    }
    if (event.target.matches('.quiz-option input[type="radio"]')) {
      const questions = ui.chapters[ui.current]?.sections?.testeSe?.questions || [];
      quizFlowFor(ui.chapters[ui.current], questions).answer(Number(event.target.value));
    }
  });
  panel.addEventListener('click', event => {
    if (event.target.closest('[data-quiz-prev]')) {
      const questions = ui.chapters[ui.current]?.sections?.testeSe?.questions || [];
      quizFlowFor(ui.chapters[ui.current], questions).previous();
      renderLesson();
      return;
    }
    if (event.target.closest('[data-quiz-next]')) {
      const questions = ui.chapters[ui.current]?.sections?.testeSe?.questions || [];
      const flow = quizFlowFor(ui.chapters[ui.current], questions);
      const selected = panel.querySelector(`input[name="q-${ui.current}-${flow.currentIndex}"]:checked`);
      if (selected) flow.answer(Number(selected.value));
      if (flow.responses[flow.currentIndex] === null) return showToast('Escolha uma opção para continuar.');
      if (flow.next()) renderLesson();
      else submitQuiz();
      return;
    }
    if (event.target.closest('[data-submit-quiz]')) { submitQuiz(); return; }
    if (event.target.closest('[data-mark-complete]')) {
      const wasComplete = ui.completed.has(ui.current);
      const wasStarted = ui.started.has(ui.current);
      if (ui.completed.has(ui.current)) ui.completed.delete(ui.current);
      else { ui.completed.add(ui.current); ui.started.add(ui.current); }
      const changedIndex = ui.current;
      renderList(); updateStats();
      persistProgress(changedIndex).then(saved => {
        if (saved) return;
        if (wasComplete) ui.completed.add(changedIndex);
        else ui.completed.delete(changedIndex);
        if (!wasStarted) ui.started.delete(changedIndex);
        renderList(); updateStats();
      });
      return;
    }
  });

  async function submitQuiz() {
    const chapter = ui.chapters[ui.current];
    const questions = chapter?.sections?.testeSe?.questions || [];
    const flow = chapter ? quizFlowFor(chapter, questions) : null;
    const responses = flow?.responses || [];
    if (!questions.length || responses.some(value => value === null)) {
      showToast('Complete cada etapa do questionário antes de conferir.');
      return;
    }
    const feedback = $('#quiz-feedback', panel);
    if (activeSupabase && ui.userId) {
      const submitButton = panel.querySelector('[data-quiz-next]');
      submitButton.disabled = true;
      submitButton.textContent = 'CONFERINDO…';
      try {
        const result = await submitConnectedQuiz(activeSupabase, chapter.id, responses);
        if (result.status !== 'scored') return showToast('Não foi possível conferir ou salvar o quiz. Tente novamente.');
        const previousBest = ui.quizScores.get(chapter.id) || 0;
        ui.quizScores.set(chapter.id, result.data.points);
        ui.score += result.data.points - previousBest;
        feedback.textContent = `Seu melhor resultado: ${result.data.correctCount} de ${result.data.questionCount}. ${result.data.points} pontos salvos.`;
        feedback.style.color = '#536500';
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'CONFERIR RESPOSTAS';
      }
    } else {
      let correctCount = 0;
      questions.forEach((question, index) => {
        if (responses[index] !== question.correctIndex) return;
        correctCount += 1;
        const key = `${ui.current}-${index}`;
        if (!ui.answered.has(key)) { ui.score += 10; ui.answered.add(key); }
      });
      feedback.textContent = `Você acertou ${correctCount} de ${questions.length}. +10 pontos por resposta certa nesta prévia.`;
      feedback.style.color = correctCount ? '#536500' : '#9b3434';
      savePreviewState();
    }
    const completedPartsBeforeQuiz = chapterSections(ui.current);
    recordSection(ui.current, 'testeSe', { quizCompleted: true });
    feedback.hidden = false;
    renderList(); updateStats();
    if (!await persistProgress(ui.current)) {
      ui.completedSections.set(ui.current, completedPartsBeforeQuiz);
      renderList(); updateStats();
    }
  }
  function displayAvatar(url) {
    const preview = $('#avatar-preview');
    if (ui.avatarUrl?.startsWith('blob:')) URL.revokeObjectURL(ui.avatarUrl);
    ui.avatarUrl = url || null;
    preview.hidden = !url;
    $('#avatar-mark').hidden = Boolean(url);
    if (url) preview.src = url;
  }
  async function loadPreviewAvatar() {
    if (!avatarStore) return;
    try {
      const image = await profileService.loadPreviewAvatar();
      if (image) {
        displayAvatar(URL.createObjectURL(image));
      }
    } catch {
      showToast('O navegador não permitiu carregar o avatar salvo.');
    }
  }
  $('#invite-button').addEventListener('click', () => {
    $('#invite-link').value = getStudentInvitationUrl(window.location.origin, window.location.hostname, window.location.pathname);
    $('#invite-dialog').showModal();
  });
  $('#sidebar-toggle').addEventListener('click', event => {
    const collapsed = !shell.classList.contains('sidebar-collapsed');
    shell.classList.toggle('sidebar-collapsed', collapsed);
    event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
    event.currentTarget.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
    event.currentTarget.title = collapsed ? 'Expandir menu' : 'Recolher menu';
    event.currentTarget.textContent = collapsed ? '›' : '‹';
    navigationPreferences.save({ sidebarCollapsed: collapsed });
  });
  $('#chapter-list-toggle').addEventListener('click', event => {
    const collapsed = !courseLayout.classList.contains('chapter-list-collapsed');
    courseLayout.classList.toggle('chapter-list-collapsed', collapsed);
    list.hidden = false;
    list.style.display = '';
    event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
    event.currentTarget.setAttribute('aria-label', collapsed ? 'Expandir lista de capítulos' : 'Recolher lista de capítulos');
    event.currentTarget.title = collapsed ? 'Expandir lista de capítulos' : 'Recolher lista de capítulos';
    event.currentTarget.textContent = collapsed ? '›' : '‹';
    navigationPreferences.save({ chapterListCollapsed: collapsed });
  });
  $('[data-resume-course]').addEventListener('click', async () => {
    const previous = ui.current;
    ui.current = resumeIndex;
    ui.tab = 'entenda';
    ui.started.add(resumeIndex);
    renderList(); renderLesson();
    if (!await persistProgress(resumeIndex)) {
      ui.current = previous;
      renderList(); renderLesson();
      return;
    }
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const heading = panel.querySelector('h2');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  });
  $('#invite-cancel').addEventListener('click', () => $('#invite-dialog').close());
  $('#invite-copy').addEventListener('click', async () => {
    const link = $('#invite-link');
    try {
      if (await copyStudentInvitation(link.value)) return showToast('Link copiado. Agora é só enviar pra alguém.');
    } catch {}
    link.focus();
    link.select();
    showToast('Link selecionado. Copie para compartilhar.');
  });
  $('#invite-share').addEventListener('click', async () => {
    try {
      const result = await shareStudentInvitation($('#invite-link').value);
      if (result === 'shared') return showToast('Escolha onde quer compartilhar o convite.');
      if (result === 'copied') return showToast('Link copiado. Agora é só enviar pra alguém.');
      $('#invite-link').focus();
      $('#invite-link').select();
      showToast('Seu navegador não oferece compartilhamento automático. Copie o link selecionado.');
    } catch (error) {
      if (error?.name !== 'AbortError') showToast('Não foi possível compartilhar agora. Você pode copiar o link.');
    }
  });
  async function persistProgress(index) {
    if (!activeSupabase || !ui.userId || !ui.chapters[index]) return savePreviewState();
    const chapter = ui.chapters[index];
    const saved = await saveStudentProgress(activeSupabase, {
      student_id: ui.userId,
      chapter_id: chapter.id,
      completed_sections: chapterSections(index),
      completed_at: ui.completed.has(index) ? new Date().toISOString() : null,
    });
    if (!saved) showToast('Não foi possível salvar o progresso agora. Verifique a conexão e tente novamente.');
    return saved;
  }

  async function loadChapters() {
    if (activeSupabaseConfigured) {
      if (!activeSupabase) throw new Error('A configuração do Supabase está incompleta.');
      const { data: sessionData } = await activeSupabase.auth.getSession();
      if (!sessionData.session) { location.replace('login.html'); throw new Error('Redirecionando para o login…'); }
      ui.userId = sessionData.session.user.id;
      const { data: profile, error: profileError } = await activeSupabase
        .from('profiles').select('status,display_name,phone,instagram,social_url,avatar_path')
        .eq('id', ui.userId).maybeSingle();
      if (profileError || profile?.status !== 'active') {
        await activeSupabase.auth.signOut(); location.replace('login.html');
        throw new Error('Esta conta não está ativa.');
      }
      if (profile.display_name) {
        profileDraft.name = profile.display_name;
        $('#profile-name-display').textContent = profile.display_name;
        $('#avatar-mark').textContent = profile.display_name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
      }
      if (profile.avatar_path) {
        ui.avatarPath = profile.avatar_path;
        const { data: signed } = await activeSupabase.storage.from('student-avatars').createSignedUrl(profile.avatar_path, 3600);
        if (signed?.signedUrl) displayAvatar(signed.signedUrl);
      }
      $('#student-mode').innerHTML = '<span></span> CONTA CONECTADA · PONTUAÇÃO SALVA';
      $('#student-footer-note').textContent = 'PERFIL, PROGRESSO E PONTUAÇÃO CONECTADOS';
      $('.overview-points>p').innerHTML = 'Melhores resultados dos quizzes <span>· 10 pontos por acerto</span>';
      profileDraft = { name: profile.display_name || '', email: sessionData.session.user.email || '', phone: profile.phone || '', instagram: profile.instagram || '', social: profile.social_url || '' };
      const [{ data: chapters, error: chaptersError }, { data: progress, error: progressError }, { data: quizScores, error: quizScoreError }] = await Promise.all([
        activeSupabase.from('chapters').select('id,number,title,summary,body').eq('published', true).order('number'),
        activeSupabase.from('chapter_progress').select('chapter_id,completed_sections,completed_at,updated_at').eq('student_id', ui.userId),
        activeSupabase.from('chapter_quiz_scores').select('chapter_id,points').eq('student_id', ui.userId),
      ]);
      if (chaptersError || progressError || quizScoreError) throw new Error('Não foi possível carregar seu conteúdo agora.');
      connectedProgress = progress || [];
      ui.quizScores = new Map((quizScores || []).map(row => [row.chapter_id, row.points]));
      ui.score = [...ui.quizScores.values()].reduce((total, points) => total + points, 0);
      for (const row of progress || []) {
        const index = chapters.findIndex(chapter => chapter.id === row.chapter_id);
        if (index >= 0) {
          ui.started.add(index);
          ui.completedSections.set(index, Array.isArray(row.completed_sections) ? row.completed_sections : []);
          if (row.completed_at) ui.completed.add(index);
        }
      }
      return (chapters || []).map(row => normalize({ ...row, ...row.body, id: row.id, number: row.number, title: row.title, summary: row.summary || row.body?.summary }));
    }
    if (!isLocalCoursePreviewHost(window.location.hostname)) {
      throw new Error('A prévia do curso está disponível apenas no localhost. Configure a conexão segura para acessar as aulas neste endereço.');
    }
    const response = await fetch('../content/only-djs-course-draft.json');
    if (!response.ok) throw new Error('Conteúdo não carregado. Abra a prévia por um servidor local.');
    if (savedPreview) {
      const name = savedPreview.name.trim();
      if (name) {
        $('#profile-name-display').textContent = name;
        $('#avatar-mark').textContent = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
      }
      $('#student-mode').innerHTML = '<span></span> PRÉVIA LOCAL · SALVA NESTE NAVEGADOR';
      $('#student-footer-note').textContent = 'PROGRESSO, PERFIL E PONTOS SALVOS NESTE NAVEGADOR · NÃO ENVIADOS';
    }
    return (await response.json()).chapters.map(normalize);
  }

  $('#student-logout').addEventListener('click', async event => {
    if (!activeSupabase) return;
    event.preventDefault(); await activeSupabase.auth.signOut(); location.replace('login.html');
  });

  loadChapters().then(async chapters => {
    ui.chapters = chapters;
    await loadPreviewAvatar();
    ui.current = Math.min(ui.current, Math.max(chapters.length - 1, 0));
    for (const index of [...ui.started, ...ui.completed]) if (index >= chapters.length) { ui.started.delete(index); ui.completed.delete(index); }
    if (!chapters.length && activeSupabaseConfigured) throw new Error('Ainda não há capítulos publicados para esta conta.');
    const resume = selectResumeChapter({
      mode: activeSupabase && ui.userId ? 'connected' : 'preview',
      localState: savedPreview || { current: ui.current, started: [...ui.started] },
      progress: connectedProgress,
      chapters,
    });
    resumeIndex = resume.index;
    hasResumeHistory = resume.hasHistory;
    ui.current = resume.index;
    for (const index of ui.started) {
      if (!ui.completedSections.get(index)?.length) recordSection(index, 'entenda');
    }
    renderList(); renderLesson();
  }).catch(error => {
    list.innerHTML = `<p class="lesson-loading">${escape(error.message)}</p>`;
    panel.innerHTML = '<p class="lesson-loading">Seu conteúdo aparecerá aqui quando estiver disponível.</p>';
  });
})();
