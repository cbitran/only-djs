export async function saveStudentProfile(client, studentId, updates) {
  try {
    const { error } = await client.from('profiles').update(updates).eq('id', studentId);
    return !error;
  } catch {
    return false;
  }
}

export async function saveStudentProgress(client, progress) {
  try {
    const { error } = await client.from('chapter_progress').upsert(progress, {
      onConflict: 'student_id,chapter_id',
    });
    return !error;
  } catch {
    return false;
  }
}
