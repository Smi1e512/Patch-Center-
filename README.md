# PatchCenter

## 第一步：初始化 React 网页

当前仅包含 React + TypeScript + Vite 的静态首页。没有上传组件、后端、Git 或 AI 功能。原 v0.1 保留在 `backup-v0.1` 分支。

需要 Node.js 22（建议 22.12+）和 npm。

```powershell
cd frontend
npm install
npm run dev
```

打开终端显示的地址（默认 http://localhost:5173）。看到 PatchCenter 和欢迎文字即完成本阶段验收。

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

## 下一步

在首页增加 Patch 文件选择组件，暂不发送网络请求。
