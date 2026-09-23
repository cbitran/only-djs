export async function activatePendingInvite(invokeActivation) {
  try {
    const { data, error } = await invokeActivation();
    return !error && data?.activated === true;
  } catch {
    return false;
  }
}

export async function verifyInviteToken(searchParams, verifyOtp) {
  const tokenHash = searchParams.get('token_hash');
  if (!tokenHash || searchParams.get('type') !== 'invite') return 'not-invite';
  try {
    const { error } = await verifyOtp({ token_hash: tokenHash, type: 'invite' });
    return error ? 'invalid' : 'verified';
  } catch {
    return 'invalid';
  }
}

export async function completeInvitePassword(updatePassword, invokeActivation, checkIsAdmin) {
  try {
    const { error } = await updatePassword();
    if (error) return 'password-error';
  } catch {
    return 'password-error';
  }
  if (checkIsAdmin) {
    try {
      if (await checkIsAdmin()) return 'admin-saved';
    } catch {
      return 'role-check-pending';
    }
  }
  return await activatePendingInvite(invokeActivation) ? 'activated' : 'activation-pending';
}

export async function completeAccessSetup({ isRecovery, updatePassword, invokeActivation, checkIsAdmin }) {
  if (isRecovery) {
    try {
      const { error } = await updatePassword();
      return error ? 'password-error' : 'recovery-saved';
    } catch {
      return 'password-error';
    }
  }
  return completeInvitePassword(updatePassword, invokeActivation, checkIsAdmin);
}
