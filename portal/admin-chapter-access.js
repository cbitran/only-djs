export async function setStudentChapterAccess(client, studentId, chapterId, adminId, grant) {
  try {
    const result = grant
      ? await client.from('student_chapter_access').insert({
        student_id: studentId,
        chapter_id: chapterId,
        granted_by: adminId,
      })
      : await client.from('student_chapter_access')
        .delete()
        .eq('student_id', studentId)
        .eq('chapter_id', chapterId);
    return !result?.error;
  } catch {
    return false;
  }
}
