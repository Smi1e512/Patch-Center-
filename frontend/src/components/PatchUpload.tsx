import { useId, useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';

const MAX_BYTES = 10 * 1024 * 1024;

type Props = {
  file: File | null;
  onChange: (file: File | null) => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function PatchUpload({ file, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const titleId = useId();
  const hintId = useId();
  const errorId = useId();

  function selectFiles(files: FileList) {
    if (files.length === 0) return;
    if (files.length !== 1) {
      setError('每次只能选择一个 Patch 文件。');
      return;
    }
    const candidate = files[0];
    if (!/\.(patch|diff)$/i.test(candidate.name)) {
      setError('请选择 .patch 或 .diff 格式的文件。');
      return;
    }
    if (candidate.size === 0) {
      setError('不能选择空文件。');
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setError('文件大小不能超过 10 MB。');
      return;
    }
    setError('');
    onChange(candidate);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.currentTarget.files) selectFiles(event.currentTarget.files);
    // Allow selecting the same file again after removal or validation failure.
    event.currentTarget.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    selectFiles(event.dataTransfer.files);
  }

  function removeFile() {
    onChange(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="patch-upload" aria-labelledby={titleId}>
      <h2 id={titleId}>Patch 文件</h2>
      <input
        ref={inputRef}
        type="file"
        accept=".patch,.diff"
        hidden
        onChange={handleInput}
      />
      <div
        className={`upload-zone${dragging ? ' is-dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <button
          className="upload-trigger"
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
          </svg>
          <strong>{file ? '点击或拖拽替换文件' : '点击或拖拽选择文件'}</strong>
          <span id={hintId}>支持 .patch / .diff，单个文件最大 10 MB</span>
        </button>
      </div>

      {error && <p id={errorId} className="upload-error" role="alert">{error}</p>}

      {file && (
        <div className="selected-file">
          <div className="file-info" role="status">
            <strong title={file.name}>{file.name}</strong>
            <span>{formatSize(file.size)} · 已选择</span>
          </div>
          <button className="remove-file" type="button" onClick={removeFile}>移除</button>
        </div>
      )}

      <p className="upload-note">当前仅选择本地文件，尚未上传到服务器。</p>
    </section>
  );
}
