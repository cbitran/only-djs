export async function saveAccountAvatar(client, studentId, path, file) {
  let upload;
  try {
    upload = await client.storage.from('student-avatars').upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '3600',
    });
  } catch {
    return { status: 'unknown' };
  }
  if (upload?.error) return { status: 'error' };

  let profileWrite;
  try {
    profileWrite = await client.from('profiles').update({ avatar_path: path }).eq('id', studentId);
  } catch {
    // The write may have reached Postgres before the connection failed. Keep
    // the object so an ambiguous response can never break a saved reference.
    return { status: 'unknown' };
  }
  if (profileWrite?.error) {
    try {
      await client.storage.from('student-avatars').remove([path]);
    } catch {
      // A failed cleanup leaves only an unreferenced private object.
    }
    return { status: 'error' };
  }

  try {
    const signed = await client.storage.from('student-avatars').createSignedUrl(path, 3600);
    return { status: 'saved', signedUrl: signed?.error ? null : signed?.data?.signedUrl || null };
  } catch {
    return { status: 'saved', signedUrl: null };
  }
}

export async function removeAccountAvatar(client, studentId, path) {
  let profileWrite;
  try {
    profileWrite = await client.from('profiles').update({ avatar_path: null }).eq('id', studentId);
  } catch {
    return 'unknown';
  }
  if (profileWrite?.error) return 'error';

  if (!path) return 'removed';
  try {
    const removal = await client.storage.from('student-avatars').remove([path]);
    return removal?.error ? 'cleanup-pending' : 'removed';
  } catch {
    return 'cleanup-pending';
  }
}

export async function removeObsoleteAvatar(client, path) {
  try {
    const result = await client.storage.from('student-avatars').remove([path]);
    return !result?.error;
  } catch {
    return false;
  }
}
