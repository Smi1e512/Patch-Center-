import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Icon from './components/Icon';
import AdminPanel from './components/AdminPanel';
import PatchUpload from './components/PatchUpload';
import CommitMessageInput from './components/CommitMessageInput';
import BranchSelector from './components/BranchSelector';
import { getBranchOptions, submitPatch } from './api';
import type { BranchOptions, PatchReceipt } from './api';

export default function App() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [patchFile, setPatchFile] = useState<File | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [receipt, setReceipt] = useState<PatchReceipt | null>(null);
  const [error, setError] = useState('');
  const [formVersion, setFormVersion] = useState(0);
  const [branchOptions, setBranchOptions] = useState<BranchOptions | null>(null);
  const [branchLoading, setBranchLoading] = useState(true);
  const [branchError, setBranchError] = useState('');
  const [branchVersion, setBranchVersion] = useState(0);
  const [development, setDevelopment] = useState('');
  const [cherryPick, setCherryPick] = useState<string[]>([]);

  useEffect(() => {
    if (showAdmin) return;
    const controller = new AbortController();
    setBranchLoading(true);
    setBranchError('');
    setBranchOptions(null);
    getBranchOptions(controller.signal).then(options => {
      if (controller.signal.aborted) return;
      setBranchOptions(options);
      setDevelopment(id => options.development.some(item => item.id === id) ? id : '');
      setCherryPick(ids => ids.filter(id => options.cherryPick.some(item => item.id === id)));
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setBranchError(err instanceof Error ? err.message : '无法加载分支配置。');
    }).finally(() => {
      if (!controller.signal.aborted) setBranchLoading(false);
    });
    return () => controller.abort();
  }, [showAdmin, branchVersion]);

  const canSubmit = !!patchFile && !!commitMessage.trim() && !!development && !!branchOptions && !branchLoading && !submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patchFile || !canSubmit || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError('');
    setReceipt(null);
    try {
      const result = await submitPatch(patchFile, commitMessage, development, cherryPick);
      setReceipt(result);
      setPatchFile(null);
      setCommitMessage('');
      setDevelopment('');
      setCherryPick([]);
      setFormVersion((version) => version + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请重试。');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark"><Icon name="logo" size={22} /></span>
            <div><strong>PatchCenter</strong><span>开发协作平台</span></div>
          </div>
          <nav className="app-nav" aria-label="主导航">
            <button type="button" className={!showAdmin ? 'nav-link active' : 'nav-link'}
              aria-current={!showAdmin ? 'page' : undefined} disabled={submitting}
              onClick={() => setShowAdmin(false)}><Icon name="upload" /> 提交 Patch</button>
            <button type="button" className={showAdmin ? 'nav-link active' : 'nav-link'}
              aria-current={showAdmin ? 'page' : undefined} disabled={submitting}
              onClick={() => setShowAdmin(true)}><Icon name="shield" /> 管理后台</button>
          </nav>
        </div>
      </header>
      <main className={showAdmin ? 'page admin-page' : 'page'}>
        {showAdmin ? <AdminPanel onBack={() => setShowAdmin(false)} /> : <>
          <div className="page-intro">
            <div className="eyebrow">WORKSPACE / SUBMISSION</div>
            <h1>提交 Patch</h1>
            <p>上传代码变更并填写提交说明，由管理员审核后进入后续处理流程。</p>
          </div>
          <div className="submission-layout">
            <form className="surface submission-card" onSubmit={handleSubmit}>
              <div className="surface-heading">
                <div><h2>新建提交</h2><p>请完整填写以下信息。</p></div>
                <span className="quiet-label">三项必填</span>
              </div>
              <fieldset className="submission-fields" disabled={submitting}>
                <PatchUpload file={patchFile} onChange={(file) => {
                  setPatchFile(file); setReceipt(null); setError('');
                }} disabled={submitting} />
                <CommitMessageInput key={formVersion} value={commitMessage} onChange={(value) => {
                  setCommitMessage(value); setReceipt(null); setError('');
                }} />
                <BranchSelector options={branchOptions} loading={branchLoading} error={branchError}
                  development={development} cherryPick={cherryPick}
                  onDevelopment={id => { setDevelopment(id); setReceipt(null); setError(''); }}
                  onCherryPick={ids => { setCherryPick(ids); setReceipt(null); setError(''); }}
                  onRetry={() => setBranchVersion(n => n + 1)} disabled={submitting} />
              </fieldset>
              {error && <p className="submission-error" role="alert">{error}</p>}
              {receipt && (
                <section className="submission-result" role="status">
                  <Icon name="check" size={20}/>
                  <div><strong>上传成功，等待管理员审核。</strong>
                    <span>文件：{receipt.filename}</span>
                    <span>任务 ID：<code>{receipt.id}</code></span>
                    <span>审核通过后才能进入后续处理流程。</span>
                  </div>
                </section>
              )}
              <div className="form-footer">
                <span><Icon name="shield" size={17}/> 上传不会直接执行代码</span>
                <button type="submit" className="submit-button" disabled={!canSubmit}>
                  {submitting ? '正在提交…' : '提交审核'} <Icon name="arrow" />
                </button>
              </div>
            </form>
            <aside className="submission-aside">
              <section className="surface guide-card">
                <h2>提交与审核流程</h2>
                <ol className="workflow">
                  <li><span className="workflow-number">01</span><div><strong>上传变更</strong><p>选择 Patch 文件、填写 Commit Message 并选择目标分支。</p></div></li>
                  <li><span className="workflow-number">02</span><div><strong>等待人工审核</strong><p>管理员确认任务内容，通过或驳回。</p></div></li>
                  <li><span className="workflow-number">03</span><div><strong>后续处理</strong><p>仅审核通过的任务可进入后续流程，执行功能尚未接入。</p></div></li>
                </ol>
              </section>
              <section className="surface guide-card">
                <h2>提交要求</h2>
                <dl className="guide-facts">
                  <dt>文件格式</dt><dd>.patch / .diff</dd>
                  <dt>单文件大小</dt><dd>最大 10 MB</dd>
                  <dt>提交说明</dt><dd>最多 4000 字符</dd>
                  <dt>开发分支</dt><dd>必选 1 项</dd>
                  <dt>Cherry-pick</dt><dd>可选多项</dd>
                </dl>
                <p className="guide-note"><Icon name="info" /> 当前为开发测试环境，请使用非敏感测试文件。</p>
              </section>
            </aside>
          </div>
        </>}
      </main>
      <footer className="app-footer"><span>PatchCenter · 开发协作平台</span><span>人工审核 · 受控处理</span></footer>
    </div>
  );
}
