import { useEffect, useRef, useState } from 'react';
import { AdminApiError, listAdminTasks, reviewAdminTask } from '../adminApi';
import type { AdminTask, TaskPage } from '../adminApi';
import { Fragment } from 'react';
import Icon from './Icon';

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
  const [expanded, setExpanded] = useState<string | null>(null);
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
    setExpanded(null);
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
      <div className="task-overview">
        <div className="surface metric"><span className="metric-icon"><Icon name="list" size={22}/></span><div><span>全部任务</span><strong>{page?.total ?? '—'}</strong><small>所有已接收记录</small></div></div>
        <div className="surface metric"><span className="metric-icon pending"><Icon name="clock" size={22}/></span><div><span>本页待审核</span><strong>{page ? pendingTasks.length : '—'}</strong><small>等待人工确认</small></div></div>
        <div className="surface metric"><span className="metric-icon approved"><Icon name="check" size={22}/></span><div><span>本页已通过</span><strong>{page ? page.items.filter(t => t.status === 'approved').length : '—'}</strong><small>获得后续处理许可</small></div></div>
        <div className="surface metric"><span className="metric-icon rejected"><Icon name="close" size={22}/></span><div><span>本页已驳回</span><strong>{page ? page.items.filter(t => t.status === 'rejected').length : '—'}</strong><small>终止处理流程</small></div></div>
      </div>
      <div className="surface task-card">
        <div className="surface-heading task-list-heading">
          <div><h2>任务审核</h2><p>最新提交优先 · 每页 {PAGE_SIZE} 条</p></div>
          <button type="button" className="secondary-button" onClick={refresh} disabled={loading || reviewing}><Icon name="refresh"/> 刷新列表</button>
        </div>
        {notice && <p className="inline-notice" role="status">{notice}</p>}
        {error && <p className="submission-error batch-error" role="alert">{error}</p>}
        {page && page.skipped > 0 && <p className="inline-notice" role="status">有 {page.skipped} 条异常记录无法读取，未修改原始文件。</p>}
        {page && page.items.length > 0 && (
          <>
            <div className="batch-toolbar">
              <label className="select-all-label">
                <input ref={selectAllRef} type="checkbox" checked={allSelected}
                  disabled={reviewing || pendingTasks.length === 0}
                  onChange={event => setSelected(event.target.checked ? pendingTasks.map(task => task.id) : [])} />
                全选本页待审核
              </label>
              <span className="batch-count" role="status">已选 <strong>{selectedTasks.length}</strong> 项</span>
              <div className="batch-actions">
                <button type="button" className="approve-button" disabled={reviewing || selectedTasks.length === 0} onClick={() => review(selectedTasks, 'approved')}><Icon name="check"/> 批量通过</button>
                <button type="button" className="reject-button" disabled={reviewing || selectedTasks.length === 0} onClick={() => review(selectedTasks, 'rejected')}><Icon name="close"/> 批量驳回</button>
              </div>
              {reviewing && <span className="batch-count" role="status">正在审核…</span>}
            </div>
            <div className="table-scroll">
              <table className="task-table">
                <colgroup><col className="col-check"/><col className="col-file"/><col className="col-message"/><col className="col-size"/><col className="col-time"/><col className="col-status"/><col className="col-action"/></colgroup>
                <thead><tr><th scope="col"><span className="sr-only">选择</span></th><th scope="col">Patch 文件</th><th scope="col">Commit Message</th><th scope="col">大小</th><th scope="col">提交时间</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
                <tbody>
                {page.items.map(task => (
                  <Fragment key={task.id}>
                    <tr className={selected.includes(task.id) ? 'is-selected' : ''}>
                      <td><input className="task-checkbox" type="checkbox"
                        aria-label={`选择任务 ${task.filename} ${task.id.slice(0, 8)}`}
                        checked={task.status === 'pending_review' && selected.includes(task.id)}
                        disabled={reviewing || task.status !== 'pending_review'}
                        onChange={event => toggleTask(task.id, event.target.checked)} /></td>
                      <td><div className="table-file"><Icon name="file" size={19}/><div><strong title={task.filename}>{task.filename}</strong><small title={task.id}>{task.id.slice(0, 8)} · {task.targets ? task.targets.development.label : "未指定分支"}</small></div></div></td>
                      <td><span className="table-message" title={task.commitMessage}>{task.commitMessage.split(/\r?\n/)[0] || '（多行提交信息）'}</span></td>
                      <td className="numeric">{formatSize(task.size)}</td>
                      <td className="table-time numeric">{new Date(task.createdAt).toLocaleString('zh-CN', { hour12: false })}</td>
                      <td><span className={`task-state ${task.status}`}>{STATUS_LABEL[task.status]}</span></td>
                      <td><button type="button" className="text-button" aria-expanded={expanded === task.id}
                        onClick={() => setExpanded(current => current === task.id ? null : task.id)}>
                        {expanded === task.id ? '收起' : '详情'}<Icon name="chevron" size={15} style={{transform: expanded === task.id ? 'rotate(90deg)' : undefined}}/>
                      </button></td>
                    </tr>
                    {expanded === task.id && <tr className="detail-row"><td colSpan={7}>
                      <div className="task-detail">
                        <div><h3>任务详情</h3><dl>
                          <dt>任务 ID</dt><dd><code>{task.id}</code></dd>
                          <dt>提交时间</dt><dd>{new Date(task.createdAt).toLocaleString('zh-CN')}{task.timeSource === 'metadata_mtime' ? '（历史文件修改时间）' : ''}</dd>
                          <dt>文件大小</dt><dd>{formatSize(task.size)}</dd>
                          <dt>任务状态</dt><dd>{STATUS_LABEL[task.status]}</dd>
                          <dt>开发分支</dt><dd>{task.targets?.development.label ?? "历史任务：未指定"}</dd>
                          <dt>Cherry-pick</dt><dd>{task.targets ? task.targets.cherryPick.map(item => item.label).join("、") || "不执行 Cherry-pick" : "历史任务：未指定"}</dd>
                          {task.reviewedAt && <><dt>审核时间</dt><dd>{new Date(task.reviewedAt).toLocaleString('zh-CN')}</dd></>}
                        </dl></div>
                        <div><h3>Commit Message</h3><pre>{task.commitMessage}</pre>
                          {task.status === 'pending_review' ? (
                            <div className="review-actions">
                              <button type="button" className="approve-button" disabled={reviewing} onClick={() => review([task], 'approved')}><Icon name="check"/> 审核通过</button>
                              <button type="button" className="reject-button" disabled={reviewing} onClick={() => review([task], 'rejected')}>驳回</button>
                            </div>
                          ) : <p className="upload-note">{task.status === 'approved' ? '已获得审核许可，后续执行功能尚未接入。' : '已驳回，不允许进入后续处理流程。'}</p>}
                        </div>
                      </div>
                    </td></tr>}
                  </Fragment>
                ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {loading && <div className="empty-state" role="status"><span className="spinner"/> 正在加载任务…</div>}
        {page && page.total === 0 && <div className="empty-state"><span className="empty-icon"><Icon name="file" size={32}/></span><strong>暂无提交任务</strong><p>收到新的 Patch 后，点击刷新列表查看。</p></div>}
        {!loading && !page && error && <div className="empty-state"><Icon name="info" size={28}/><strong>无法加载任务</strong><button className="secondary-button" type="button" onClick={refresh}>重试</button></div>}
        {page && <div className="task-pagination">
          <span>{page.total ? `显示 ${offset + 1}–${offset + page.items.length} 条，共 ${page.total} 条` : '共 0 条'}</span>
          <div><button className="secondary-button" type="button" disabled={reviewing || offset === 0} onClick={() => setOffset(n => Math.max(0, n - PAGE_SIZE))}>上一页</button>
          <span>第 {Math.floor(offset / PAGE_SIZE) + 1} / {Math.max(1, Math.ceil(page.total / PAGE_SIZE))} 页</span>
          <button className="secondary-button" type="button" disabled={reviewing || offset + PAGE_SIZE >= page.total} onClick={() => setOffset(n => n + PAGE_SIZE)}>下一页</button></div>
        </div>}
      </div>
    </section>
  );
}
