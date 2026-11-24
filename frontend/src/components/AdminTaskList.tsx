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
  const [reviewing, setReviewing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const reviewController = useRef<AbortController | null>(null);
  const reviewInFlight = useRef(false);
  const [notice, setNotice] = useState('');

  const pendingTasks = page?.items.filter(task => task.status === 'pending_review') ?? [];
  const selectedTasks = pendingTasks.filter(task => selected.includes(task.id));
  const allSelected = pendingTasks.length > 0 && selectedTasks.length === pendingTasks.length;
  const partiallySelected = selectedTasks.length > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partiallySelected;
  }, [partiallySelected, loading]);

  useEffect(() => () => reviewController.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPage(null);
    setSelected([]);
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

  function toggleTask(id: string, checked: boolean) {
    setSelected(current => checked ? [...new Set([...current, id])] : current.filter(item => item !== id));
  }

  async function review(tasks: AdminTask[], decision: 'approved' | 'rejected') {
    if (reviewInFlight.current || loading) return;
    const targets = tasks.filter(task => task.status === 'pending_review');
    if (!targets.length) return;
    const label = STATUS_LABEL[decision];
    const description = targets.length === 1 ? `「${targets[0].filename}」` : `选中的 ${targets.length} 个任务`;
    if (!window.confirm(`确认将${description}标记为${label}？本次不会执行 AI 或 Git 操作。`)) return;
    reviewInFlight.current = true;
    const controller = new AbortController();
    reviewController.current = controller;
    setReviewing(true);
    setError('');
    setNotice('');
    let succeeded = 0;
    const failures: string[] = [];
    let stopped = false;
    try {
      for (const task of targets) {
        if (controller.signal.aborted) break;
        try {
          const updated = await reviewAdminTask(token, task.id, decision, controller.signal);
          if (controller.signal.aborted) break;
          succeeded++;
          setPage(current => current ? { ...current, items: current.items.map(item => item.id === updated.id ? updated : item) } : current);
          setSelected(current => current.filter(id => id !== updated.id));
        } catch (err) {
          if (controller.signal.aborted) break;
          if (err instanceof AdminApiError && err.status === 401) {
            onUnauthorized();
            return;
          }
          failures.push(`${task.filename}：${err instanceof Error ? err.message : '审核失败'}`);
          // Stop on unknown outcomes or infrastructure failures; avoid
          // continuing to submit after the server or network becomes unreliable.
          if (!(err instanceof AdminApiError) || err.status >= 500 || err.status === 429) {
            stopped = true;
            break;
          }
        }
      }
      if (controller.signal.aborted) return;
      if (succeeded) setNotice(`${succeeded} 个任务已${label}。`);
      if (failures.length) setError(`${failures.length} 个请求未确认成功${stopped ? `，剩余 ${targets.length - succeeded - failures.length} 个未提交` : ''}。请刷新确认状态。\n${failures.join('\n')}`);
    } finally {
      reviewInFlight.current = false;
      reviewController.current = null;
      if (!controller.signal.aborted) setReviewing(false);
    }
  }

  return (
    <section className="admin-tasks" aria-label="任务管理">
      <div className="task-list-heading">
        <div>
          <h3>任务管理</h3>
          <p className="upload-note">{page ? `共 ${page.total} 个任务 · 最新提交优先` : '查看已接收的 Patch 任务'}</p>
        </div>
        <button type="button" className="secondary-button" onClick={refresh} disabled={loading || reviewing}>刷新列表</button>
      </div>
      {loading && <p role="status">正在加载任务…</p>}
      {notice && <p className="upload-note" role="status">{notice}</p>}
      {error && <p className="submission-error batch-error" role="alert">{error}</p>}
      {page && page.skipped > 0 && <p className="upload-note" role="status">有 {page.skipped} 条异常记录无法读取，未修改原始文件。</p>}
      {page && page.total === 0 && <div className="admin-welcome">暂无任务，收到新的 Patch 后可刷新查看。</div>}
      {page && page.items.length > 0 && (
        <div className="batch-toolbar">
          <label className="select-all-label">
            <input ref={selectAllRef} type="checkbox" checked={allSelected}
              disabled={reviewing || pendingTasks.length === 0}
              onChange={event => setSelected(event.target.checked ? pendingTasks.map(task => task.id) : [])} />
            全选本页待审核
          </label>
          <span className="batch-count" role="status">已选 {selectedTasks.length} 项</span>
          <div className="batch-actions">
            <button type="button" className="approve-button" disabled={reviewing || selectedTasks.length === 0} onClick={() => review(selectedTasks, 'approved')}>批量通过</button>
            <button type="button" className="reject-button" disabled={reviewing || selectedTasks.length === 0} onClick={() => review(selectedTasks, 'rejected')}>批量驳回</button>
          </div>
          {reviewing && <span className="batch-count" role="status">正在审核…</span>}
        </div>
      )}
      {page && page.items.map(task => (
        <div key={task.id} className={`task-row${selected.includes(task.id) ? ' is-selected' : ''}`}>
          <input className="task-checkbox" type="checkbox"
            aria-label={`选择任务 ${task.filename} ${task.id.slice(0, 8)}`}
            checked={task.status === 'pending_review' && selected.includes(task.id)}
            disabled={reviewing || task.status !== 'pending_review'}
            onChange={event => toggleTask(task.id, event.target.checked)} />
        <details className="task-item">
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
                <button type="button" className="approve-button" disabled={reviewing} onClick={() => review([task], 'approved')}>审核通过</button>
                <button type="button" className="reject-button" disabled={reviewing} onClick={() => review([task], 'rejected')}>驳回</button>
              </div>
            ) : <p className="upload-note">{task.status === 'approved' ? '已获得审核许可，后续执行功能尚未接入。' : '已驳回，不允许进入后续处理流程。'}</p>}
          </div>
        </details>
        </div>
      ))}
      {page && page.total > PAGE_SIZE && (
        <div className="task-pagination">
          <button className="secondary-button" type="button" disabled={reviewing || offset === 0} onClick={() => setOffset(n => Math.max(0, n - PAGE_SIZE))}>上一页</button>
          <span>第 {Math.floor(offset / PAGE_SIZE) + 1} / {Math.ceil(page.total / PAGE_SIZE)} 页</span>
          <button className="secondary-button" type="button" disabled={reviewing || offset + PAGE_SIZE >= page.total} onClick={() => setOffset(n => n + PAGE_SIZE)}>下一页</button>
        </div>
      )}
    </section>
  );
}
