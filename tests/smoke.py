"""Run from project root after installing backend/requirements.txt and httpx."""
import os, subprocess, sys, tempfile, time
from pathlib import Path
from fastapi.testclient import TestClient


def git(repo, *args):
    return subprocess.check_output(['git', *args], cwd=repo, stderr=subprocess.STDOUT)

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    repo = root / 'repo'; repo.mkdir()
    git(repo, 'init'); git(repo, 'config', 'user.email', 'test@example.invalid'); git(repo, 'config', 'user.name', 'Smoke Test')
    file = repo / 'demo.txt'; file.write_text('old\n'); git(repo, 'add', '.'); git(repo, 'commit', '-m', 'initial')
    file.write_text('new\n'); patch = git(repo, 'diff', '--binary'); file.write_text('my local changes\n')
    os.environ.update(REPO_PATH=str(repo), BASE_REF='HEAD', PATCHCENTER_DATA=str(root/'data'), AI_ENABLED='true', AI_EXECUTABLE=sys.executable)
    # Substitute an offline test executable for the real CLI, validating the AI adapter and task metadata.
    import json
    fake = root/'fake_ai.py'; fake.write_text('import json, pathlib, subprocess\nassert "commitMessage" in json.loads(pathlib.Path("../request.json").read_text(encoding="utf-8"))\nassert "approved local patch task" in __import__("sys").argv[1]\nsubprocess.run(["git", "apply", "../change.patch"], check=True)\nprint("mock AI complete")\n')
    os.environ['AI_ARGS'] = json.dumps([str(fake)])
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
    from main import app
    with TestClient(app) as client:
        def create(data):
            r = client.post('/api/tasks', files={'patch':('demo.patch',data)}, data={'message':'feat: smoke test'})
            assert r.status_code == 201, r.text
            return r.json()['id']
        def run(tid, mode):
            r = client.post(f'/api/tasks/{tid}/run', json={'mode':mode}); assert r.status_code == 202, r.text
            for _ in range(200):
                row = client.get(f'/api/tasks/{tid}').json()
                if row['status'] in ('review','failed'): return row
                time.sleep(.05)
            raise AssertionError('task timeout')
        assert client.get('/api/config').status_code == 200
        for mode in ('git','ai'):
            tid=create(patch); row=run(tid,mode)
            assert row['status']=='review', row
            assert '+new' in row['diff'], row
            assert (Path(row['worktree'])/'demo.txt').read_text()=='new\n'
            assert client.get(f'/api/tasks/{tid}/patch').content==patch
            assert client.post(f'/api/tasks/{tid}/run',json={'mode':mode}).status_code==409
        row=run(create(b'not a patch'),'git'); assert row['status']=='failed',row
        assert file.read_text()=='my local changes\n'
        assert len(client.get('/api/tasks').json())==3
        assert client.post('/api/tasks',files={'patch':('bad.exe',b'bad')},data={'message':'x'}).status_code==400
    print('PASS: upload, Git apply, mock AI, failure, download, duplicate prevention, original dirty tree preserved')
