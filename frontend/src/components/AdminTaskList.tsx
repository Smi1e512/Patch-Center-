import { useEffect, useState } from 'react';
import { AdminApiError, listAdminTasks } from '../adminApi';
import type { TaskPage } from '../adminApi';

const PAGE_SIZE = 20;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AdminTaskList({ token, onUnauthorized }: {
  token: string;
  onUnauthorized: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState<TaskPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPage(null);
    setError('');
    listAdminTasks(token, offset, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (offset > 0 && offset >= data.total) {
        setOffset(Math.max(0, Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE));
        return;
      }
      setPage(data);
      setLoading(false);
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      if (err instanceof AdminApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : '加载任务失败。');
      setLoading(false);
    });
    return () => controller.abort();
  }, [token, offset, version, onUnauthorized]);

  function refresh() {
    setOffset(0);
    setVersion(value => value + 1);
  }

  return (
    <section className="admin-tasks" aria-label="任务管理">
      <div className="task-list-heading">
        <div>
          <h3>任务管理</h3>
          <p className="upload-note">{page ? `共 ${page.total} 个任务 · 最新提交优先` : '查看已接收的 Patch 任务'}</p>
        </div>
        <button type="button" className="secondary-button" onClick={refresh} disabled={loading}>刷新列表</button>
      </div>
      {loading && <p role="status">正在加载任务…</p>}
      {error && <p className="submission-error" role="alert">{error}</p>}
      {page && page.skipped > 0 && <p className="upload-note" role="status">有 {page.skipped} 条异常记录无法读取，未修改原始文件。</p>}
      {page && page.total === 0 && <div className="admin-welcome">暂无任务，收到新的 Patch 后可刷新查看。</div>}
      {page && page.items.map(task => (
        <details key={task.id} className="task-item">
          <summary>
            <div className="task-summary">
              <strong className="task-filename">{task.filename}</strong>
              <span className="task-state">已接收</span>
              <span className="task-preview">{task.commitMessage.split(/\r?\n/)[0] || '（多行提交信息）'}</span>
              <span className="task-meta">{new Date(task.createdAt).toLocaleString('zh-CN')} · {formatSize(task.size)}</span>
            </div>
          </summary>
          <div className="task-detail">
            <dl>
              <dt>任务 ID</dt><dd>{task.id}</dd>
              <dt>提交时间</dt><dd>{new Date(task.createdAt).toLocaleString('zh-CN')}{task.timeSource === 'metadata_mtime' ? '（历史文件修改时间）' : ''}</dd>
              <dt>文件大小</dt><dd>{formatSize(task.size)}</dd>
              <dt>任务状态</dt><dd>已接收，尚未执行</dd>
            </dl>
            <strong>Commit Message</strong>
            <pre>{task.commitMessage}</pre>
          </div>
        </details>
      ))}
      {page && page.total > PAGE_SIZE && (
        <div className="task-pagination">
          <button className="secondary-button" type="button" disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - PAGE_SIZE))}>上一页</button>
          <span>第 {Math.floor(offset / PAGE_SIZE) + 1} / {Math.ceil(page.total / PAGE_SIZE)} 页</span>
          <button className="secondary-button" type="button" disabled={offset + PAGE_SIZE >= page.total} onClick={() => setOffset(n => n + PAGE_SIZE)}>下一页</button>
        </div>
      )}
    </section>
  );
}
