# PatchCenter

## 第一步：初始化 React 网页

当前仅包含 React + TypeScript + Vite 的静态首页。没有上传组件、后端、Git 或 AI 功能。原 v0.1 保留在 `main` 分支。

### 本地启动

需要 Node.js 22（建议 22.12+）和 npm。

```powershell
cd frontend
npm install
npm run dev
```

打开终端显示的地址（默认 http://localhost:5173）。看到 PatchCenter 和欢迎文字即完成本阶段验收。

生产构建：`npm run build`。

### 下一步

在首页增加 Patch 文件选择组件，暂不发送网络请求。
