# PatchCenter

## 第一步：初始化 React 网页

当前包含 React + TypeScript + Vite 首页、Patch 文件选择组件和 Commit Message 输入框。没有后端、Git 或 AI 功能。原 v0.1 保留在 `backup-v0.1` 分支。

需要 Node.js 22（建议 22.12+）和 npm。

```powershell
cd frontend
npm install
npm run dev
```

打开终端显示的地址（默认 http://localhost:5173）。看到 PatchCenter 和文件选择区域即表示页面启动成功。

## 第二步：局域网访问（仅开发测试）

在公司允许的可信网络内，从 frontend 目录启动：

```powershell
npm run dev:lan
```

该命令让 Vite 监听所有 IPv4 网络接口的 5173 端口（若端口已占用则报错，而不是切换端口）。普通 `npm run dev` 仍保持默认本机访问。

在终端查看 Network 地址，或在另一个 PowerShell 窗口执行 `ipconfig`，找到实际联网网卡的 IPv4 地址。例如你的地址为 192.168.1.100，同事就可以打开 http://192.168.1.100:5173 。

验收：同事在网络互通的电脑上用浏览器打开该地址，看到 PatchCenter 首页。

若无法访问，在同事电脑执行：

```powershell
Test-NetConnection 192.168.1.100 -Port 5173
```

将示例 IP 替换为你的真实 IP。如果 TcpTestSucceeded 为 False，检查服务是否仍在运行、IP 是否正确、Windows 防火墙和公司网络访问策略。如确需放行，请按公司规定仅对授权网络或同事 IP 放行 TCP 5173，不要关闭防火墙或配置公网端口转发。网络隔离时应联系管理员。

开发服务器必须保持运行，关闭终端或电脑休眠、关机后，同事将无法访问。Vite 开发服务器只适用于开发测试；当前仅分享静态首页，不得用于传输公司 Patch、凭据或调用本地 AI。正式多人使用前需采用生产部署、认证、权限控制等措施。

生产构建：`npm run build`。

## 第三步：Patch 文件选择

点击或拖拽选择一个 .patch 或 .diff 文件（不区分扩展名大小写，最大 10 MB，即 10 × 1024 × 1024 字节）。页面显示文件名、大小，支持移除和替换。无效格式、空文件、超限文件或同时拖入多个文件时显示错误，保留之前有效的选择。

组件位于 `frontend/src/components/PatchUpload.tsx`，由 `App.tsx` 保存 File 对象。此阶段文件仅留在浏览器内存，不读取内容、不发送网络请求，刷新页面后清空。

验收（请使用非敏感测试文件）：点击选择、拖拽选择、移除后重新选择同一个文件；测试 .txt 文件、空文件、超过 10 MB 的文件和同时拖入多个文件；确认错误提示及已有选择保留。仍可使用 `npm run dev:lan` 让同事验证页面。

## 第四步：Commit Message 输入框

在 Patch 文件选择区域下方填写 Commit Message。支持多行输入、实时长度统计（按 JavaScript UTF-16 代码单元计数）和最多 4000 个代码单元的限制。输入框失去焦点时校验必填，空字符串和纯空白字符均无效；输入有效内容后错误提示消失。

组件位于 `frontend/src/components/CommitMessageInput.tsx`，由 `App.tsx` 通过 useState 保存原始字符串（包括换行）。切换 Patch 文件不会清空 Commit Message。刷新页面后两项均清空。

验收：填写普通提交信息、多行文本、清空后移开焦点、输入纯空白、粘贴超长文本并查看长度限制。此阶段没有提交按钮、后端请求或 Git 操作。

## 下一步

初始化 Python + FastAPI 后端，实现独立的健康检查接口。
