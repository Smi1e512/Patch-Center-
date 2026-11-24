export type PatchReceipt = {
  id: string;
  filename: string;
  size: number;
  status: 'pending_review';
};

export async function submitPatch(file: File, commitMessage: string): Promise<PatchReceipt> {
  const data = new FormData();
  data.append('patch', file);
  data.append('commit_message', commitMessage);

  let response: Response;
  try {
    response = await fetch('/api/patches', {
      method: 'POST',
      body: data,
    });
  } catch {
    throw new Error('无法连接后端，请确认 Python 服务正在运行。');
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof result?.detail === 'string'
      ? result.detail
      : `提交失败（HTTP ${response.status}），请检查后端服务。`);
  }
  if (response.status !== 201 || result?.status !== 'pending_review' ||
      typeof result.id !== 'string' || typeof result.filename !== 'string' ||
      typeof result.size !== 'number') {
    throw new Error('后端返回了无效的提交结果。');
  }
  return result as PatchReceipt;
}
