export async function invokeAdminAction(client, functionName, body) {
  try {
    const result = await client.functions.invoke(functionName, { body });
    return { data: result?.data ?? null, error: result?.error ?? null };
  } catch (error) {
    return { data: null, error };
  }
}
