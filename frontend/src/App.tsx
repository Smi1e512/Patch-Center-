import { useState } from 'react';
import PatchUpload from './components/PatchUpload';

export default function App() {
  const [patchFile, setPatchFile] = useState<File | null>(null);

  return (
    <main className="page">
      <h1>PatchCenter</h1>
      <p className="subtitle">Patch 提交工具</p>
      <PatchUpload file={patchFile} onChange={setPatchFile} />
    </main>
  );
}
