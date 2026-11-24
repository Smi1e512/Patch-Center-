import { useId, useState } from 'react';

const MAX_LENGTH = 4000;

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function CommitMessageInput({ value, onChange }: Props) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const invalid = touched && !value.trim();

  return (
    <section className="commit-message">
      <label className="commit-label" htmlFor={id}>
        <span className="field-index">02</span> Commit Message <span className="required-mark" aria-hidden="true">*</span>
      </label>
      <textarea
        id={id}
        className={`commit-input${invalid ? ' is-invalid' : ''}`}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={() => setTouched(true)}
        rows={5}
        maxLength={MAX_LENGTH}
        required
        aria-invalid={invalid}
        aria-describedby={`${id}-hint ${id}-count${invalid ? ` ${id}-error` : ''}`}
        placeholder={'feat: 简要描述本次修改\n\n可选：补充详细变更说明'}
      />
      <div className="commit-meta">
        <span id={`${id}-hint`}>必填，支持多行提交信息。</span>
        <span id={`${id}-count`}>{value.length} / {MAX_LENGTH}</span>
      </div>
      {invalid && (
        <p id={`${id}-error`} className="commit-error" role="alert">
          请输入 Commit Message，不能只包含空白字符。
        </p>
      )}
    </section>
  );
}
