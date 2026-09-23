const LOCAL_PREVIEW_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLocalCoursePreviewHost(hostname) {
  return LOCAL_PREVIEW_HOSTS.has(String(hostname).toLowerCase());
}

export function isLocalStudentPreviewMode(hostname, search) {
  if (!isLocalCoursePreviewHost(hostname)) return false;
  return new URLSearchParams(String(search || '')).has('preview-revision');
}
