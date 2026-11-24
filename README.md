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

成功返回 HTTP 201、id、filename、size 和 status=pending_review；页面显示接收结果并清空表单。失败保留输入并显示错误。上传目录已加入 .gitignore；管理后台提供任务查询与人工审核，不提供 Patch 内容下载或执行接口。文件扩展名校验不代表 Patch 内容正确。

验收：分别在本机与经授权的同事电脑提交非敏感测试文件，检查本机 uploads 目录和 JSON 中的多行提交信息。停止后端后测试错误提示，再重启。无需修改防火墙的 39472 端口。

仅用于受控开发测试：普通访客提交接口仍无登录、限流或传输加密。开启 LAN 模式会使可达的用户能够提交文件；不要接收真实公司代码或敏感数据，不要暴露公网。以后接入 AI 前需要独立的本地审核、权限隔离和执行入口。

## 管理后台：单密码验证

普通访客无需登录，可以继续提交 Patch。顶部导航“管理后台”需要管理员密码，验证成功后可查看任务列表及详情，不执行 AI 或 Git 操作。

首次配置或修改密码（先停止服务，在项目根目录执行）：

```powershell
python stop.py
.\backend\.venv\Scripts\python.exe backend/manage_admin.py
python start.py
```

如果还没有虚拟环境，先按第五步安装依赖。输入至少 12 个字符的独立管理员密码并确认，不会显示在终端，也不需要写入命令行。没有默认密码；未设置时后台不可登录。普通提交不受影响。

- 密码使用随机盐和 scrypt 哈希保存于 backend/data/admin.json；会话只保存随机 Token 的 SHA-256 哈希。该目录被 Git 忽略，并加入 Vite 文件访问拒绝规则。
- 浏览器通过 localStorage 保存随机 Token，不保存密码或 isAdmin 标志。进入后台时通过 Authorization: Bearer 请求后端验证；同一浏览器、同一网页地址下刷新、重启服务后仍有效。
- Token 不主动过期；退出登录撤销当前 Token，重置密码撤销全部 Token。最多保留 64 个有效凭证，超过时撤销最早的。清理浏览器存储不会自动撤销服务端凭证。
- 登录失败限制为全局每分钟 5 次（单进程内存计数）。所有未来后台 API 必须使用 Depends(require_admin) 校验。
- 请只在本机 http://localhost:39471 使用管理员入口。LAN 开发服务是明文 HTTP，不能用于传输真实管理员凭证、公司代码或敏感数据；正式远程使用前配置 HTTPS、可靠的生产服务及更严格的安全控制。不要使用其他系统的密码。

验收：未设置密码时不可登录；设置后错误密码被拒绝、正确密码进入后台；刷新并重启后重新进入后台无需密码；退出后需重新登录；重置密码使原凭证失效；直接访问 /api/admin/session 无 Token 返回 401；普通提交仍正常。

后端测试：在 backend 目录使用虚拟环境 Python 执行 `python -m unittest discover -s tests`（请先激活虚拟环境，或将 python 替换为 .venv 中的解释器）。

## 管理后台：任务管理

登录后台后自动加载任务列表，默认最新提交优先，每页 20 条。点击任务行“详情”展开完整 Commit Message、任务 ID、时间、文件大小及状态，点击“刷新列表”获取最新任务。上传后状态为“待审核”。管理员打开任务详情后可点击“审核通过”或“驳回”，确认后保存审核结果。现阶段不下载、删除或执行 Patch。

后端 GET /api/admin/tasks?offset=0&limit=20 必须携带管理员 Bearer Token，返回分页任务元数据；响应禁止缓存。数据直接读取 backend/uploads/<id>/request.json，并确认对应 change.patch 存在且大小匹配，无需数据库。新提交增加 UTC createdAt，历史记录使用 request.json 文件修改时间，并在详情标明。未完成上传不显示，损坏记录跳过并提示数量；查询不修改原始记录。

验收：提交两份非敏感测试 Patch，进入后台查看最新任务在前，展开核对多行 Commit Message，提交第三份后刷新，检查旧任务仍可查看。未认证访问任务接口应返回 401。测试分页、空目录及异常记录，可运行现有 unittest 命令。

## 人工审核关卡

普通访客只上传 Patch 和 Commit Message，不提供审核状态，服务端固定设置 pending_review。历史 received 任务也视为待审核。

管理员通过 POST /api/admin/tasks/{id}/review（JSON decision 为 approved 或 rejected）审核，必须持有有效 Token。仅允许 pending_review 转为 approved 或 rejected，重复审核返回 409。审核状态及 UTC reviewedAt 原子写入原 request.json，单进程内加锁，保留原始提交时间及 Patch 文件，不依赖数据库。重启后审核结果保留。

审核通过仅表示允许进入后续处理，并不表示执行成功，也不自动启动任何 AI 或 Git 操作。将来执行入口必须在服务端重新检查状态为 approved，未审核和驳回任务不得进入执行流程。当前尚无执行入口。

验收：上传后看到待审核，管理员审核一条通过、一条驳回，刷新和重启后状态不变，无法重复审核，无 Token 的审核请求返回 401，上传时无论如何都不会触发执行。

## 批量审核

桌面任务表格左侧提供复选框，只有待审核任务可选择。顶部支持全选或取消全选当前页的待审核任务（部分选中时显示半选状态），展示已选数量，并提供“批量通过”和“批量驳回”。翻页或刷新会清空选择，保留原来的单条审核入口。

批量操作确认后，前端逐条调用现有管理员审核 API，不新增数据库、批量事务或后端接口。每个任务独立保存审核结果，成功项取消选择，失败项提示原因；网络异常或服务端异常时停止剩余请求，提示刷新确认实际状态。离开后台会停止前端剩余请求，但已经发送的审核可能已保存，不能撤销。审核通过仍不执行 AI 或 Git。

验收：提交至少三条测试任务，勾选两条批量通过，确认未勾选项仍为待审核；全选当前页剩余任务批量驳回；检查已审核项不可选、空选时按钮禁用、刷新及翻页清空选择；模拟另一窗口先审核同一任务，确认重复请求被拒绝且提示部分失败。

## 桌面端界面

顶部统一导航；提交页采用表单与流程说明双栏布局；管理员验证页采用独立双栏布局；后台采用宽屏数据表格、任务统计和行内详情。统计中“全部任务”为服务端总量，其他状态数量仅统计当前页。窄窗口自动适配，表格支持横向滚动。原有认证、上传、审核、分页及批量操作保持不变。无需额外前端依赖。

## 下一步

按需完善审核后的处理能力；AI 通信暂缓。
