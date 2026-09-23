async function signOutQuietly(client) {
  try {
    await client.auth.signOut();
  } catch {
    // The original authorization/network failure is the useful result here.
  }
}

export async function resolveLoginDestination(client, email, password) {
  let signIn;
  try {
    signIn = await client.auth.signInWithPassword({ email, password });
  } catch {
    return 'unavailable';
  }

  const user = signIn?.data?.user;
  if (signIn?.error || !user) return 'credentials';

  let adminCheck;
  try {
    adminCheck = await client.rpc('is_current_user_admin');
  } catch {
    await signOutQuietly(client);
    return 'unavailable';
  }
  if (adminCheck?.error) {
    await signOutQuietly(client);
    return 'unavailable';
  }
  if (adminCheck?.data === true) return 'admin';

  let profileResult;
  try {
    profileResult = await client
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .maybeSingle();
  } catch {
    await signOutQuietly(client);
    return 'unavailable';
  }

  if (profileResult?.error || profileResult?.data?.status !== 'active') {
    await signOutQuietly(client);
    return 'inactive';
  }
  return 'student';
}

export async function requestPasswordRecovery(client, email, redirectTo) {
  try {
    const result = await client.auth.resetPasswordForEmail(email, { redirectTo });
    return result?.error ? 'error' : 'sent';
  } catch {
    return 'error';
  }
}
