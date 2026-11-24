import { useState } from 'react';
import PatchUpload from './components/PatchUpload';
import CommitMessageInput from './components/CommitMessageInput';

export default function App() {
  const [patchFile, setPatchFile] = useState<File | null>(null);
  const [commitMessage, setCommitMessage] = useState('');

  return (
    <main className="page">
      <h1>PatchCenter</h1>
      <p className="subtitle">Patch 提交工具</p>
      <PatchUpload file={patchFile} onChange={setPatchFile} />
      <CommitMessageInput value={commitMessage} onChange={setCommitMessage} />
    </main>
  );
}
