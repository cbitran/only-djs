import { supabase, supabaseConfigured } from './supabase-client.js';
import { createStudentPreviewStore } from './student-preview-store.js';
import { createStudentAvatarStore } from './student-avatar-store.js';
import { isLocalStudentPreviewMode } from './student-preview-mode.js';
import { createNavigationPreferences } from './student-navigation-state.js';
import { createStudentProfileService } from './student-profile-service.js';

(() => {
  const $ = selector => document.querySelector(selector);
  const localPreview = isLocalStudentPreviewMode(location.hostname, location.search);
  if (localPreview) {
    document.querySelectorAll('a[href^="student.html"]').forEach(link => {
      const target = new URL(link.href);
      target.search = location.search;
      link.href = target.href;
    });
  }
  const client = localPreview || !supabaseConfigured ? null : supabase;
  let previewStore = null;
  let avatarStore = null;
  if (!client) {
    try {
      previewStore = createStudentPreviewStore(localStorage);
      avatarStore = createStudentAvatarStore();
    } catch {
      previewStore = createStudentPreviewStore(null);
      avatarStore = null;
    }
  }
  let userId = null;
  let avatarPath = null;
  let avatarUrl = null;
  let profileService = createStudentProfileService({ client, previewStore, avatarStore });
  const preferences = createNavigationPreferences(safeStorage());
  const shell = $('#profile-shell');
  const navigation = preferences.load();
  shell.classList.toggle('sidebar-collapsed', navigation.sidebarCollapsed);
  $('#sidebar-toggle').setAttribute('aria-expanded', String(!navigation.sidebarCollapsed));
  $('#sidebar-toggle').textContent = navigation.sidebarCollapsed ? '›' : '‹';

  function safeStorage() {
    try { return localStorage; } catch { return null; }
  }
  function toast(message) {
    const element = $('#profile-toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove('show'), 4000);
  }
  function setAvatar(url) {
    if (avatarUrl?.startsWith('blob:')) URL.revokeObjectURL(avatarUrl);
    avatarUrl = url || null;
    for (const [imageSelector, markSelector] of [['#avatar-preview', '#avatar-mark'], ['#profile-avatar-preview', '#profile-avatar-mark']]) {
      const image = $(imageSelector), mark = $(markSelector);
      image.hidden = !url;
      mark.hidden = Boolean(url);
      if (url) image.src = url;
    }
    $('#avatar-remove').hidden = !url;
  }
  function setName(name) {
    const normalized = name.trim() || 'Aluno';
    $('#profile-name').value = normalized;
    $('#profile-name-display').textContent = normalized;
    const initials = normalized.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    $('#avatar-mark').textContent = initials;
    $('#profile-avatar-mark').textContent = initials;
  }
  function populate(fields) {
    setName(fields.name || 'Bitran');
    $('#profile-email').value = fields.email || '';
    $('#profile-email').readOnly = Boolean(client);
    $('#profile-form').elements.phone.value = fields.phone || '';
    $('#profile-form').elements.instagram.value = fields.instagram || '';
    $('#profile-form').elements.social.value = fields.social || '';
  }
  function profileFields() {
    const form = $('#profile-form');
    return {
      name: form.elements.name.value.trim() || 'Aluno',
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      instagram: form.elements.instagram.value.trim(),
      social: form.elements.social.value.trim(),
    };
  }
  async function initialize() {
    if (!client && !localPreview) {
      location.replace('login.html');
      return;
    }
    if (client) {
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData.session) { location.replace('login.html'); return; }
      userId = sessionData.session.user.id;
      profileService = createStudentProfileService({ client, userId });
      const { data: profile, error } = await client.from('profiles')
        .select('status,display_name,phone,instagram,social_url,avatar_path')
        .eq('id', userId).maybeSingle();
      if (error || profile?.status !== 'active') {
        await client.auth.signOut();
        location.replace('login.html');
        return;
      }
      populate({ name: profile.display_name, email: sessionData.session.user.email, phone: profile.phone, instagram: profile.instagram, social: profile.social_url });
      avatarPath = profile.avatar_path;
      if (avatarPath) {
        const { data } = await client.storage.from('student-avatars').createSignedUrl(avatarPath, 3600);
        if (data?.signedUrl) setAvatar(data.signedUrl);
      }
      $('#profile-mode').innerHTML = '<span></span> CONTA CONECTADA · SALVA NA SUA CONTA';
      $('#profile-footer-note').textContent = 'PERFIL CONECTADO À SUA CONTA';
      $('#profile-save-note').textContent = 'Nome, telefone, redes e avatar salvam na sua conta. O e-mail de acesso não é editável aqui.';
    } else {
      const fields = profileService.loadPreview() || {};
      populate(fields);
      const avatar = await profileService.loadPreviewAvatar();
      if (avatar) setAvatar(URL.createObjectURL(avatar));
    }
  }

  $('#sidebar-toggle').addEventListener('click', event => {
    const collapsed = !shell.classList.contains('sidebar-collapsed');
    shell.classList.toggle('sidebar-collapsed', collapsed);
    event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
    event.currentTarget.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
    event.currentTarget.title = collapsed ? 'Expandir menu' : 'Recolher menu';
    event.currentTarget.textContent = collapsed ? '›' : '‹';
    preferences.save({ sidebarCollapsed: collapsed });
  });
  $('#profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const fields = profileFields();
    const button = $('#profile-save');
    button.disabled = true;
    try {
      let saved;
      if (client && userId) {
        saved = await profileService.saveConnectedProfile({
          display_name: fields.name,
          phone: fields.phone || null,
          instagram: fields.instagram || null,
          social_url: fields.social || null,
        });
      } else {
        saved = profileService.savePreview(fields);
      }
      if (!saved) return toast('Não foi possível salvar agora. Verifique a conexão e tente novamente.');
      setName(fields.name);
      toast(client ? 'Perfil atualizado na sua conta.' : 'Perfil salvo neste navegador. Nada foi enviado ao servidor.');
    } finally {
      button.disabled = false;
    }
  });
  $('#avatar-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      event.target.value = '';
      return toast('Use uma imagem JPG, PNG ou WebP.');
    }
    if (file.size > 3 * 1024 * 1024) {
      event.target.value = '';
      return toast('A imagem precisa ter até 3 MB.');
    }
    try {
      if (client && userId) {
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
        const path = `${userId}/${crypto.randomUUID()}.${extension}`;
        const result = await profileService.saveConnectedAvatar(path, file);
        if (result.status !== 'saved') return toast(result.status === 'unknown' ? 'Conexão interrompida. Recarregue para conferir antes de tentar novamente.' : 'Não foi possível salvar o avatar. Tente novamente.');
        const previousPath = avatarPath;
        avatarPath = path;
        if (result.signedUrl) setAvatar(result.signedUrl);
        if (previousPath && !await profileService.removeObsoleteConnectedAvatar(previousPath)) toast('Avatar atualizado; a imagem anterior será removida depois.');
        else toast('Avatar salvo na sua conta.');
      } else {
        await profileService.savePreviewAvatar(file);
        setAvatar(URL.createObjectURL(file));
        toast('Avatar salvo neste navegador. Nenhuma imagem foi enviada ao servidor.');
      }
    } catch {
      toast('Não foi possível salvar o avatar. Tente novamente.');
    } finally {
      event.target.value = '';
    }
  });
  $('#avatar-remove').addEventListener('click', async () => {
    try {
      if (client && userId) {
        if (!avatarPath) return;
        const result = await profileService.removeConnectedAvatar(avatarPath);
        if (result === 'unknown' || result === 'error') return toast('Não foi possível confirmar a remoção. Atualize para conferir o estado do avatar.');
        avatarPath = null;
        setAvatar(null);
        toast(result === 'cleanup-pending' ? 'Avatar removido do perfil; a imagem privada antiga será limpa depois.' : 'Avatar removido da sua conta.');
      } else {
        await profileService.removePreviewAvatar();
        setAvatar(null);
        toast('Avatar removido desta prévia local.');
      }
    } catch {
      toast('Não foi possível remover o avatar agora.');
    }
  });
  $('#profile-logout').addEventListener('click', async event => {
    if (!client) return;
    event.preventDefault();
    await client.auth.signOut();
    location.replace('login.html');
  });

  initialize().catch(() => toast('Não foi possível carregar seu perfil. Tente novamente.'));
})();
