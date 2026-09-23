export async function activatePendingInvite(invokeActivation) {
  try {
    const { data, error } = await invokeActivation();
    return !error && data?.activated === true;
  } catch {
    return false;
  }
}

export async function completeInvitePassword(updatePassword, invokeActivation) {
  try {
    const { error } = await updatePassword();
    if (error) return 'password-error';
  } catch {
    return 'password-error';
  }
  return await activatePendingInvite(invokeActivation) ? 'activated' : 'activation-pending';
}

export async function completeAccessSetup({ isRecovery, updatePassword, invokeActivation }) {
  if (isRecovery) {
    try {
      const { error } = await updatePassword();
      return error ? 'password-error' : 'recovery-saved';
    } catch {
      return 'password-error';
    }
  }
  return completeInvitePassword(updatePassword, invokeActivation);
}
