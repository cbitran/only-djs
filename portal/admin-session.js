async function signOutQuietly(client) {
  try {
    await client.auth.signOut();
  } catch {
    // A failed logout must not turn an authorization failure into access.
  }
}

export async function verifyAdminSession(client) {
  let sessionResult;
  try {
    sessionResult = await client.auth.getSession();
  } catch {
    return { status: 'unavailable' };
  }
  if (sessionResult?.error) return { status: 'unavailable' };
  const session = sessionResult?.data?.session;
  if (!session?.user?.id) return { status: 'unauthenticated' };

  let roleResult;
  try {
    roleResult = await client.rpc('is_current_user_admin');
  } catch {
    await signOutQuietly(client);
    return { status: 'unavailable' };
  }
  if (roleResult?.error) {
    await signOutQuietly(client);
    return { status: 'unavailable' };
  }
  if (roleResult.data !== true) {
    await signOutQuietly(client);
    return { status: 'denied' };
  }
  return { status: 'admin', userId: session.user.id };
}
