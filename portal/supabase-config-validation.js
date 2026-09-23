function isBrowserSafeApiKey(key) {
  if (key.startsWith('sb_publishable_')) return true;
  if (key.startsWith('sb_secret_')) return false;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

export function isSupabaseConfigForProject({ url = '', projectRef = '', publishableKey = '' } = {}) {
  if (typeof url !== 'string' || typeof projectRef !== 'string' ||
      typeof publishableKey !== 'string' || !url.trim() || !projectRef.trim() || !publishableKey.trim()) {
    return false;
  }
  if (!isBrowserSafeApiKey(publishableKey.trim())) return false;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      (parsed.pathname !== '' && parsed.pathname !== '/')) return false;

  const hostname = parsed.hostname.toLowerCase();
  if (projectRef === 'local') {
    return parsed.protocol === 'http:' &&
      (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]');
  }

  return /^[a-z0-9]{20}$/.test(projectRef) &&
    parsed.protocol === 'https:' && hostname === `${projectRef}.supabase.co`;
}

export function createClientForMatchingProject(config, clientFactory) {
  if (!isSupabaseConfigForProject(config)) return null;
  return clientFactory(config.url, config.publishableKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });
}
