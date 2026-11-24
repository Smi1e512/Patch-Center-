# PatchCenter

## Windows 一键启动与关闭

当前端口：前端 TCP 39471（同事访问），后端 TCP 39472（仅本机）。若曾使用旧端口，请先运行 `python stop.py` 停止旧服务再重新启动；如 Windows 防火墙需要放行，按公司规定仅对授权网络放行新的前端端口。

在项目根目录运行 `python start.py`（如果 Windows 已将 .py 关联到 Python 控制台解释器，也可以直接双击 `start.py`），会自动准备 Python 虚拟环境和缺失或配置变更后的依赖，依次启动后端（127.0.0.1:39472）和前端（0.0.0.0:39471），检查前后端连通后打开浏览器。首次需要安装 Python 3.10+、Node.js 22.12+，并能访问依赖仓库。请先关闭之前手动启动的服务。

- 另开一个终端，在项目根目录运行 `python stop.py`（或双击 `stop.py`），也可以在启动窗口按 Ctrl+C，关闭该次启动的前后端。
- 关闭启动窗口时，Windows Job Object 会清理本次启动的子进程；不会按进程名关闭其他 Python 或 Node 程序。
- 端口被占用会提示错误，不会自动结束占用进程。
- 默认局域网测试模式；只需要本机访问时，在 PowerShell 执行 `python start.py --local`。
- 已上传的文件不会被关闭脚本删除。运行状态保存在被 Git 忽略的 `.runtime/` 目录。
- 不需要 BAT 文件，不需要额外的 Python 启动器依赖；仍可按下文手动启动。开发模式仅使用非敏感测试文件，不能对公网开放。

## 第一步：初始化 React 网页

当前包含 React + TypeScript + Vite 首页、Patch 文件选择组件和 Commit Message 输入框。后端提供健康检查和 Patch 提交接口，通过 Vite 代理接收文件及 Commit Message，尚未接入 Git 或 AI。原 v0.1 保留在 `backup-v0.1` 分支。

需要 Node.js 22（建议 22.12+）和 npm。

```powershell
cd frontend
npm install
npm run dev
```

打开终端显示的地址（默认 http://localhost:39471）。看到 PatchCenter 和文件选择区域即表示页面启动成功。

## 第二步：局域网访问（仅开发测试）

在公司允许的可信网络内，从 frontend 目录启动：

```powershell
npm run dev:lan
```

该命令让 Vite 监听所有 IPv4 网络接口的 39471 端口（若端口已占用则报错，而不是切换端口）。普通 `npm run dev` 仍保持默认本机访问。

在终端查看 Network 地址，或在另一个 PowerShell 窗口执行 `ipconfig`，找到实际联网网卡的 IPv4 地址。例如你的地址为 192.168.1.100，同事就可以打开 http://192.168.1.100:39471 。

验收：同事在网络互通的电脑上用浏览器打开该地址，看到 PatchCenter 首页。

若无法访问，在同事电脑执行：

```powershell
Test-NetConnection 192.168.1.100 -Port 39471
```

将示例 IP 替换为你的真实 IP。如果 TcpTestSucceeded 为 False，检查服务是否仍在运行、IP 是否正确、Windows 防火墙和公司网络访问策略。如确需放行，请按公司规定仅对授权网络或同事 IP 放行 TCP 39471，不要关闭防火墙或配置公网端口转发。网络隔离时应联系管理员。

开发服务器必须保持运行，关闭终端或电脑休眠、关机后，同事将无法访问。Vite 开发服务器只适用于开发测试；当前仅分享静态首页，不得用于传输公司 Patch、凭据或调用本地 AI。正式多人使用前需采用生产部署、认证、权限控制等措施。

生产构建：`npm run build`。

## 第三步：Patch 文件选择

点击或拖拽选择一个 .patch 或 .diff 文件（不区分扩展名大小写，最大 10 MB，即 10 × 1024 × 1024 字节）。页面显示文件名、大小，支持移除和替换。无效格式、空文件、超限文件或同时拖入多个文件时显示错误，保留之前有效的选择。

组件位于 `frontend/src/components/PatchUpload.tsx`，由 `App.tsx` 保存 File 对象。提交前文件留在浏览器内存，刷新页面后清空。

验收（请使用非敏感测试文件）：点击选择、拖拽选择、移除后重新选择同一个文件；测试 .txt 文件、空文件、超过 10 MB 的文件和同时拖入多个文件；确认错误提示及已有选择保留。仍可使用 `npm run dev:lan` 让同事验证页面。

## 第四步：Commit Message 输入框

在 Patch 文件选择区域下方填写 Commit Message。支持多行输入、实时长度统计（按 JavaScript UTF-16 代码单元计数）和最多 4000 个代码单元的限制。输入框失去焦点时校验必填，空字符串和纯空白字符均无效；输入有效内容后错误提示消失。

组件位于 `frontend/src/components/CommitMessageInput.tsx`，由 `App.tsx` 通过 useState 保存原始字符串（包括换行）。切换 Patch 文件不会清空 Commit Message。刷新页面后两项均清空。

验收：填写普通提交信息、多行文本、清空后移开焦点、输入纯空白、粘贴超长文本并查看长度限制。提交功能见第六步。

## 第五步：初始化 Python + FastAPI 后端

需要 Python 3.10 或更高版本。保持前端运行，在新的 PowerShell 窗口中，从项目根目录执行：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 39472
```

打开 http://127.0.0.1:39472/api/health ，应返回 `{"status":"ok"}`（HTTP 200）。接口文档位于 http://127.0.0.1:39472/docs 。

也可以在另一个 PowerShell 窗口执行：

```powershell
Invoke-RestMethod http://127.0.0.1:39472/api/health
```

后端只监听本机地址，不需要开放 39472 端口，也不影响同事访问前端的 39471 端口。无需配置跨域，文件提交见第六步；尚不操作 Git 或 AI。健康检查仅代表 HTTP 服务正常响应，不代表其他依赖已就绪。

## 第六步：前后端联通

更新代码后，在 backend 目录重新安装依赖并启动后端（命令见第五步），再从 frontend 目录重启 `npm run dev` 或 `npm run dev:lan`。Vite 将同源 /api 请求代理到本机 127.0.0.1:39472，因此无需向同事开放后端端口。

选择一个非敏感测试 Patch 并填写 Commit Message，点击“提交 Patch”。前端使用 FormData 发送 POST /api/patches，字段名为 patch 和 commit_message。后端独立校验格式、大小、非空和提交信息，使用随机 ID 保存原始字节及 UTF-8 JSON 元数据：

```text
backend/uploads/<id>/
  change.patch
  request.json
```

成功返回 HTTP 201、id、filename、size 和 status=received；页面显示接收结果并清空表单。失败保留输入并显示错误。上传目录已加入 .gitignore；不提供文件读取或执行接口。文件扩展名校验不代表 Patch 内容正确。

验收：分别在本机与经授权的同事电脑提交非敏感测试文件，检查本机 uploads 目录和 JSON 中的多行提交信息。停止后端后测试错误提示，再重启。无需修改防火墙的 39472 端口。

仅用于受控开发测试：目前没有登录、限流或传输加密。开启 LAN 模式会使可达的用户能够提交文件；不要接收真实公司代码或敏感数据，不要暴露公网。以后接入 AI 前需要独立的本地审核、权限隔离和执行入口。

## 下一步

验证本地 AI CLI 的非交互调用方式，先只发送固定的测试 Prompt，不将网页上传直接连接到 AI。
