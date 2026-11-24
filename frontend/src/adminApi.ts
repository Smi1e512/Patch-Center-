export const ADMIN_TOKEN_KEY = 'patchcenter.admin.token';

export class AdminApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request(path: string, options: RequestInit = {}, token?: string) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`/api/admin/${path}`, {
    ...options, headers, cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AdminApiError(response.status, typeof data?.detail === 'string'
      ? data.detail : `后台请求失败（HTTP ${response.status}）。`);
  }
  return data;
}

export async function loginAdmin(password: string): Promise<string> {
  const data = await request('login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (typeof data?.token !== 'string' || data.token.length !== 43) {
    throw new Error('后台返回了无效凭证。');
  }
  return data.token;
}

export async function verifyAdmin(token: string, signal?: AbortSignal) {
  const data = await request('session', { signal }, token);
  if (data?.authenticated !== true) throw new Error('后台验证失败。');
}

export async function logoutAdmin(token: string) {
  await request('logout', { method: 'POST' }, token);
}

export function readToken(): string | null {
  try { return localStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; }
}

export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}

export type AdminTask = {
  id: string;
  filename: string;
  size: number;
  commitMessage: string;
  status: 'pending_review' | 'approved' | 'rejected';
  reviewedAt: string | null;
  targets: { development: { id: string; label: string }; cherryPick: { id: string; label: string }[] } | null;
  createdAt: string;
  timeSource: 'recorded' | 'metadata_mtime';
};

export type TaskPage = {
  items: AdminTask[];
  total: number;
  offset: number;
  limit: number;
  skipped: number;
};

export async function listAdminTasks(token: string, offset: number, signal?: AbortSignal): Promise<TaskPage> {
  const data = await request(`tasks?offset=${offset}&limit=20`, { signal }, token);
  if (!Array.isArray(data?.items) || !Number.isInteger(data.total) ||
      !Number.isInteger(data.offset) || !Number.isInteger(data.limit) ||
      !Number.isInteger(data.skipped)) {
    throw new Error('后台返回了无效的任务列表。');
  }
  return data as TaskPage;
}

export async function reviewAdminTask(token: string, id: string, decision: 'approved' | 'rejected', signal?: AbortSignal): Promise<AdminTask> {
  const data = await request(`tasks/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
    signal,
  }, token);
  if (data?.id !== id || data.status !== decision) {
    throw new Error('后台返回了无效的审核结果，请刷新列表确认。');
  }
  return data as AdminTask;
}
