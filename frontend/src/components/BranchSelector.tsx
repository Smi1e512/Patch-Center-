import type { BranchOptions } from '../api';

export default function BranchSelector({ options, loading, error, development, cherryPick, onDevelopment, onCherryPick, onRetry, disabled }: {
  options: BranchOptions | null; loading: boolean; error: string;
  development: string; cherryPick: string[];
  onDevelopment: (id: string) => void; onCherryPick: (ids: string[]) => void;
  onRetry: () => void; disabled: boolean;
}) {
  return <section className="branch-selector" aria-labelledby="branch-heading">
    <h2 id="branch-heading"><span className="field-index">03</span> 目标分支</h2>
    {loading && <p className="upload-note" role="status">正在加载分支配置…</p>}
    {error && <div className="branch-error"><p role="alert">{error}</p><button className="secondary-button" type="button" onClick={onRetry} disabled={disabled}>重新加载</button></div>}
    {options && <>
      <label className="branch-label" htmlFor="development-branch">开发分支 <span className="required-mark">*</span></label>
      <select id="development-branch" className="branch-select" required value={development} onChange={event => onDevelopment(event.target.value)} disabled={disabled}>
        <option value="">请选择开发分支</option>
        {options.development.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <div className="branch-cherry-heading">
        <span className="branch-label" id="cherry-heading">Cherry-pick 分支（可选）</span>
        <span className="batch-count">已选 {cherryPick.length} 项</span>
      </div>
      <div role="group" aria-labelledby="cherry-heading" className="branch-choices">
        {options.cherryPick.map(item => <label key={item.id} className={`branch-choice${cherryPick.includes(item.id) ? ' checked' : ''}`}>
          <input type="checkbox" checked={cherryPick.includes(item.id)} disabled={disabled}
            onChange={event => onCherryPick(event.target.checked ? [...cherryPick, item.id] : cherryPick.filter(id => id !== item.id))}/>
          <span>{item.label}</span>
        </label>)}
        {!options.cherryPick.length && <p className="upload-note">当前未配置 Cherry-pick 分支。</p>}
      </div>
      <p className="upload-note">开发分支必须选择一项；不勾选 Cherry-pick 分支则仅处理开发分支。审核通过后才允许执行。</p>
    </>}
  </section>;
}
