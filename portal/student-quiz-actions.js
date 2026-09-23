export async function submitConnectedQuiz(client, chapterId, responses) {
  try {
    const result = await client.functions.invoke('submit-chapter-quiz', {
      body: { chapterId, responses },
    });
    if (result?.error || !result?.data) return { status: 'error' };
    return { status: 'scored', data: result.data };
  } catch {
    return { status: 'error' };
  }
}
