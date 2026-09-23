const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const LOCAL_LANDING_PATH = '/source/landing-page-only-djs/project/ONLY%20DJs%20Landing.dc.html';

function validatePublicUrl(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError('Invitation must use a public web URL.');
  return parsed.toString();
}

export function getStudentInvitationUrl(origin, hostname) {
  const path = LOCAL_HOSTS.has(String(hostname).toLowerCase()) ? LOCAL_LANDING_PATH : '/';
  return new URL(path, origin).toString();
}

export async function copyStudentInvitation(url, navigatorApi = globalThis.navigator) {
  const safeUrl = validatePublicUrl(url);
  if (typeof navigatorApi?.clipboard?.writeText !== 'function') return false;
  await navigatorApi.clipboard.writeText(safeUrl);
  return true;
}

export async function shareStudentInvitation(url, navigatorApi = globalThis.navigator) {
  const safeUrl = validatePublicUrl(url);
  if (typeof navigatorApi?.share === 'function') {
    await navigatorApi.share({
      title: 'ONLY DJs',
      text: 'Vem conhecer a ONLY DJs e descobrir o mundo do DJing.',
      url: safeUrl,
    });
    return 'shared';
  }
  return await copyStudentInvitation(safeUrl, navigatorApi) ? 'copied' : 'manual';
}
