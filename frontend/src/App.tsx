import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import AdminPanel from './components/AdminPanel';
import PatchUpload from './components/PatchUpload';
import CommitMessageInput from './components/CommitMessageInput';
import { submitPatch } from './api';
import type { PatchReceipt } from './api';

export default function App() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [patchFile, setPatchFile] = useState<File | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [receipt, setReceipt] = useState<PatchReceipt | null>(null);
  const [error, setError] = useState('');
  const [formVersion, setFormVersion] = useState(0);
  const canSubmit = !!patchFile && !!commitMessage.trim() && !submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patchFile || !commitMessage.trim() || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError('');
    setReceipt(null);
    try {
      const result = await submitPatch(patchFile, commitMessage);
      setReceipt(result);
      setPatchFile(null);
      setCommitMessage('');
      setFormVersion((version) => version + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请重试。');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <div className="page-heading">
        <h1>PatchCenter</h1>
        {!showAdmin && <button type="button" className="secondary-button" disabled={submitting} onClick={() => setShowAdmin(true)}>管理后台</button>}
      </div>
      <p className="subtitle">Patch 提交工具</p>
      {showAdmin ? <AdminPanel onBack={() => setShowAdmin(false)} /> : <>
      <form onSubmit={handleSubmit}>
        <fieldset className="submission-fields" disabled={submitting}>
          <PatchUpload file={patchFile} onChange={(file) => {
            setPatchFile(file); setReceipt(null); setError('');
          }} disabled={submitting} />
          <CommitMessageInput key={formVersion} value={commitMessage} onChange={(value) => {
            setCommitMessage(value); setReceipt(null); setError('');
          }} />
        </fieldset>
        <button type="submit" className="submit-button" disabled={!canSubmit}>
          {submitting ? '正在提交…' : '提交 Patch'}
        </button>
      </form>
      {error && <p className="submission-error" role="alert">{error}</p>}
      {receipt && (
        <section className="submission-result" role="status">
          <strong>提交成功，后端已接收文件。</strong>
          <span>文件：{receipt.filename}</span>
          <span>任务 ID：{receipt.id}</span>
          <span>暂未执行 Git 或 AI 操作。</span>
        </section>
      )}
      </>}
    </main>
  );
}
