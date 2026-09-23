const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function renderSourceList(sources) {
  const items = Array.isArray(sources) ? sources.map((source) => {
    const title = escapeHtml(source?.title || 'Fonte');
    const href = safeHttpUrl(source?.url);
    return `<li>${href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${title} ↗</a>`
      : title}</li>`;
  }).join('') : '';
  return `<h3>Fontes para conferir</h3><ul>${items}</ul>`;
}
