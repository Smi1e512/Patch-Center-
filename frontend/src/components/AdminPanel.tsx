import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AdminApiError, loginAdmin, logoutAdmin, readToken, saveToken, verifyAdmin } from '../adminApi';

import AdminTaskList from './AdminTaskList';

type Phase = 'checking' | 'login' | 'ready' | 'unavailable';

export default function AdminPanel({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const pending = useRef(false);
  const onUnauthorized = useCallback(() => {
    saveToken(null);
    setToken(null);
    setNotice('');
    setError('登录凭证已失效，请重新输入密码。');
    setPhase('login');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const stored = readToken();
    setError('');
    if (!stored) {
      setToken(null);
      setPhase('login');
      return () => controller.abort();
    }
    setPhase('checking');
    verifyAdmin(stored, controller.signal).then(() => {
      if (controller.signal.aborted) return;
      setToken(stored);
      setPhase('ready');
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      if (err instanceof AdminApiError && err.status === 401) {
        saveToken(null);
        setToken(null);
        setPhase('login');
      } else {
        setError(err instanceof Error ? err.message : '无法验证登录状态。');
        setPhase('unavailable');
      }
    });
    return () => controller.abort();
  }, [retry]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const credential = await loginAdmin(password);
      if (!saveToken(credential)) setNotice('浏览器禁止本地存储，本次登录无法长期保存。');
      setToken(credential);
      setPhase('ready');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败。');
      setPassword('');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function logout() {
    if (!token || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await logoutAdmin(token);
      saveToken(null);
      setToken(null);
      setNotice('');
      setPhase('login');
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        saveToken(null);
        setToken(null);
        setNotice('');
        setPhase('login');
      } else {
        setError('未能撤销登录凭证，请确认后端服务正常后重试。');
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-heading">
        <h2>{phase === 'ready' ? '管理后台' : '管理员验证'}</h2>
        {phase === 'ready' && <button className="secondary-button" type="button" disabled={busy} onClick={logout}>退出登录</button>}
      </div>
      {phase === 'checking' && <p role="status">正在验证登录状态…</p>}
      {phase === 'unavailable' && <button type="button" className="secondary-button" onClick={() => setRetry(n => n + 1)}>重新验证</button>}
      {phase === 'login' && (
        <form onSubmit={login}>
          <label className="commit-label" htmlFor="admin-password">管理员密码</label>
          <input id="admin-password" className="admin-password" type="password"
            autoComplete="current-password" value={password} maxLength={256}
            required disabled={busy} onChange={event => setPassword(event.target.value)}
            placeholder="请输入管理员密码" autoFocus />
          <button type="submit" className="submit-button" disabled={busy || !password}>
            {busy ? '正在验证…' : '进入后台'}
          </button>
          <p className="upload-note">登录凭证保存在当前浏览器，退出登录后失效。</p>
        </form>
      )}
      {phase === 'ready' && token && (
        <AdminTaskList token={token} onUnauthorized={onUnauthorized} />
      )}
      {notice && <p className="upload-note" role="status">{notice}</p>}
      {error && <p className="submission-error" role="alert">{error}</p>}
      <button className="secondary-button back-button" type="button" disabled={busy} onClick={onBack}>返回首页</button>
    </section>
  );
}
