export type PatchReceipt = {
  id: string;
  filename: string;
  size: number;
  status: 'pending_review';
};

export async function submitPatch(file: File, commitMessage: string, development: string, cherryPick: string[]): Promise<PatchReceipt> {
  const data = new FormData();
  data.append('patch', file);
  data.append('commit_message', commitMessage);
  data.append('development_branch_id', development);
  cherryPick.forEach(id => data.append('cherry_pick_branch_ids', id));

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

export type BranchOption = { id: string; label: string };
export type BranchOptions = { development: BranchOption[]; cherryPick: BranchOption[] };

export async function getBranchOptions(signal?: AbortSignal): Promise<BranchOptions> {
  const response = await fetch('/api/branches', { signal, cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : '无法加载分支配置。');
  const valid = (items: unknown): items is BranchOption[] => Array.isArray(items) &&
    items.every(item => typeof item?.id === 'string' && typeof item?.label === 'string');
  if (!valid(data?.development) || !valid(data?.cherryPick) || !data.development.length) {
    throw new Error('分支配置无效，请联系管理员。');
  }
  return data as BranchOptions;
}
