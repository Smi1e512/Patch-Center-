import { useEffect, useRef, useState } from 'react';
import { AdminApiError, listAdminTasks, reviewAdminTask } from '../adminApi';
import type { AdminTask, TaskPage } from '../adminApi';

const PAGE_SIZE = 20;
const STATUS_LABEL = { pending_review: '待审核', approved: '审核通过', rejected: '已驳回' } as const;

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
  const [reviewing, setReviewing] = useState<string | null>(null);
  const reviewInFlight = useRef(false);
  const [notice, setNotice] = useState('');

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
    setNotice('');
    setOffset(0);
    setVersion(value => value + 1);
  }

  async function review(task: AdminTask, decision: 'approved' | 'rejected') {
    if (reviewInFlight.current || task.status !== 'pending_review') return;
    const label = STATUS_LABEL[decision];
    if (!window.confirm(`确认将「${task.filename}」标记为${label}？本次不会执行 AI 或 Git 操作。`)) return;
    reviewInFlight.current = true;
    setReviewing(task.id);
    setError('');
    setNotice('');
    try {
      const updated = await reviewAdminTask(token, task.id, decision);
      setPage(current => current ? { ...current, items: current.items.map(item => item.id === updated.id ? updated : item) } : current);
      setNotice(`${task.filename}：${label}`);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : '审核失败，请刷新列表确认。');
    } finally {
      reviewInFlight.current = false;
      setReviewing(null);
    }
  }

  return (
    <section className="admin-tasks" aria-label="任务管理">
      <div className="task-list-heading">
        <div>
          <h3>任务管理</h3>
          <p className="upload-note">{page ? `共 ${page.total} 个任务 · 最新提交优先` : '查看已接收的 Patch 任务'}</p>
        </div>
        <button type="button" className="secondary-button" onClick={refresh} disabled={loading || reviewing !== null}>刷新列表</button>
      </div>
      {loading && <p role="status">正在加载任务…</p>}
      {notice && <p className="upload-note" role="status">{notice}</p>}
      {error && <p className="submission-error" role="alert">{error}</p>}
      {page && page.skipped > 0 && <p className="upload-note" role="status">有 {page.skipped} 条异常记录无法读取，未修改原始文件。</p>}
      {page && page.total === 0 && <div className="admin-welcome">暂无任务，收到新的 Patch 后可刷新查看。</div>}
      {page && page.items.map(task => (
        <details key={task.id} className="task-item">
          <summary>
            <div className="task-summary">
              <strong className="task-filename">{task.filename}</strong>
              <span className={`task-state ${task.status}`}>{STATUS_LABEL[task.status]}</span>
              <span className="task-preview">{task.commitMessage.split(/\r?\n/)[0] || '（多行提交信息）'}</span>
              <span className="task-meta">{new Date(task.createdAt).toLocaleString('zh-CN')} · {formatSize(task.size)}</span>
            </div>
          </summary>
          <div className="task-detail">
            <dl>
              <dt>任务 ID</dt><dd>{task.id}</dd>
              <dt>提交时间</dt><dd>{new Date(task.createdAt).toLocaleString('zh-CN')}{task.timeSource === 'metadata_mtime' ? '（历史文件修改时间）' : ''}</dd>
              <dt>文件大小</dt><dd>{formatSize(task.size)}</dd>
              <dt>任务状态</dt><dd>{STATUS_LABEL[task.status]}</dd>
              {task.reviewedAt && <><dt>审核时间</dt><dd>{new Date(task.reviewedAt).toLocaleString('zh-CN')}</dd></>}
            </dl>
            <strong>Commit Message</strong>
            <pre>{task.commitMessage}</pre>
            {task.status === 'pending_review' ? (
              <div className="review-actions">
                <button type="button" className="approve-button" disabled={reviewing !== null} onClick={() => review(task, 'approved')}>审核通过</button>
                <button type="button" className="reject-button" disabled={reviewing !== null} onClick={() => review(task, 'rejected')}>驳回</button>
              </div>
            ) : <p className="upload-note">{task.status === 'approved' ? '已获得审核许可，后续执行功能尚未接入。' : '已驳回，不允许进入后续处理流程。'}</p>}
          </div>
        </details>
      ))}
      {page && page.total > PAGE_SIZE && (
        <div className="task-pagination">
          <button className="secondary-button" type="button" disabled={reviewing !== null || offset === 0} onClick={() => setOffset(n => Math.max(0, n - PAGE_SIZE))}>上一页</button>
          <span>第 {Math.floor(offset / PAGE_SIZE) + 1} / {Math.ceil(page.total / PAGE_SIZE)} 页</span>
          <button className="secondary-button" type="button" disabled={reviewing !== null || offset + PAGE_SIZE >= page.total} onClick={() => setOffset(n => n + PAGE_SIZE)}>下一页</button>
        </div>
      )}
    </section>
  );
}
