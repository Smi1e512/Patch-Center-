# PatchCenter v0.1

本地 Patch 任务中心：React + TypeScript + Vite + Ant Design + FastAPI + SQLite。

## 1. Windows 启动

要求 Python 3.10+、Node.js 22+、Git。先把项目解压到与业务仓库不同的目录。

PowerShell 窗口一（在 PatchCenter 根目录）：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

将 `REPO_PATH` 改为真实 Git 仓库根目录，`BASE_REF` 默认 HEAD（当前提交，不含未提交改动），也可以填写本地分支或已存在的远端跟踪分支。不会自动 fetch。

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

PowerShell 窗口二（从 PatchCenter 根目录）：

```powershell
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173 。后端接口文档：http://127.0.0.1:8000/docs 。

## 2. 第一次测试（无需 AI）

在测试仓库中用 `git diff --binary > change.patch`（请使用 PowerShell 7.4+ 或 Git Bash，避免旧版 PowerShell 修改输出编码），也可以通过 `git diff --binary --output=change.patch` 生成 Patch；已暂存修改使用 `git diff --cached --binary --output=change.patch`。不要把 patch 文件放进将要提交的代码中。新建未跟踪文件需先暂存或使用其他合适的 patch 生成方式。

网页上传 Patch，填写 Commit Message，进入任务详情，下载原始 Patch 检查后选择“仅 Git Apply”，点击确认执行。成功后可查看 Git Diff、文件状态和工作目录。未跟踪文件仅列在文件状态中，需到工作目录检查其内容。查看原仓库，未提交改动应保持不变。

## 3. 启用自己的 AI

先在 PowerShell 中确认：

```powershell
Get-Command opencode-cli
opencode-cli --help
opencode-cli run --help
opencode-cli run "Reply OK without editing files"
```

标准 OpenCode 支持 `opencode run <prompt>`，但内部定制 CLI 可能不同。请根据实际帮助调整 `.env`：

```dotenv
AI_ENABLED=true
AI_EXECUTABLE=opencode-cli
AI_ARGS=["run"]
AI_TIMEOUT=300
```

如果标准命令是 `opencode`，请替换对应名称。Windows 必须使用可信的真实 `.exe`（可填写绝对路径），当前版本不支持 `.cmd`、`.bat` 启动包装器；若实际只有包装器，请先确认其底层可执行程序。重启后端后，页面将启用 AI 两种模式。

AI 接收固定 Prompt，读取 worktree 上一级的 `request.json`（任务 ID、原文件名、Commit Message、基准）和 `change.patch`。如果 CLI 不支持读取该目录，需调整 CLI 的权限配置或适配器。实际 AI 认证、模型、权限需要在本机先配置好。此项目没有绑定特定模型，也不会主动发送给第三方服务；AI CLI 本身可能把源码或 Patch 发送到其配置的模型服务，请遵守公司数据政策。

## 4. 架构和代码入口

- `frontend/src/App.tsx`：上传表单、任务列表、执行模式、详情。
- `frontend/src/api.ts`：Axios 请求。
- `backend/main.py`：API、SQLite、单线程任务队列、Git/AI 适配器。
- `data/tasks/<id>/`：原始 Patch、request.json、run.log、独立 worktree、review.diff。

流程：POST /api/tasks 保存任务；POST /api/tasks/{id}/run 启动本地 worker；GET /api/tasks/{id} 轮询执行状态。Git 模式先检查再 apply，fallback 模式仅在检查失败时调用 AI，ai 模式直接让 AI 处理。成功只代表产生可审核的修改，不代表代码正确或冲突处理等价。

执行日志按命令完成后写入，不是逐 token 流式输出。重启服务会把未完成任务标记失败，需手动检查遗留工作目录；不能重复启动同一任务，可重新上传。单进程运行（不要配置多 worker）。

## 5. 可选：构建静态前端

```powershell
cd frontend
npm run build
cd ../backend
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

启动后访问 http://127.0.0.1:8000 。必须在构建后重新启动后端。

## 6. 安全与后续迭代

此版本是本机开发 MVP，**没有身份认证、角色控制或独立沙箱，不能部署到局域网或公网**。Worktree 只隔离 Git 工作目录，不限制 AI 访问本机资源。AI 默认关闭，务必只处理可信且已审核的 Patch；最好在无敏感凭据、低权限的隔离环境运行 AI。Prompt 不是强制权限边界。不要使用 `--host 0.0.0.0` 开放服务。

本版本不会由程序自动 commit/push；AI 模式仍需要 CLI 权限约束，程序只检查 HEAD 是否改变及 Git 冲突状态。工作目录保留以便审查，清理前先备份需要的修改，再使用 `git worktree remove <路径>`（有修改时不要随意强制删除）。

下一阶段：上传者和执行者身份区分、登录/审核权限、部署安全、实时日志、自动化测试与审核后 Commit，再扩展 Push/Cherry-pick。

## 7. 后端冒烟测试

安装额外测试依赖：`python -m pip install httpx`；从项目根目录执行 `python tests/smoke.py`。测试创建临时 Git 仓库，不访问真实业务仓库，AI 使用模拟程序。
