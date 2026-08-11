# SecOps Copilot - Web

> AI 安全运营研判助手 · 前端 · SSE 流式 Chat UI

[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff.svg)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 🎯 这是什么

SecOps Copilot 的前端 Web 应用。**流式渲染** AI 研判过程，把 4 个 SSE 事件（`thinking_start` / `tool_call` / `tool_result` / `final_answer`）**实时展示**给用户。

## ✨ 核心特性

### 1. **打字机效果**（useTypewriter）
- LLM 流式回答**逐字渲染**——**不**等**完整**答案
- 用户能**看到** AI **在思考**——**降低**等待焦虑

### 2. **工具调用卡片**（ToolCallCard）
- 工具名称 + 参数 + 结果**自动折叠**
- 多次工具调用**配对配对**（call_id 配对）
- 失败 / 异常**有**视觉提示

### 3. **状态栏**（StatusBar）
- 实时显示**当前状态**（思考中 / 工具调用中 / 等待输入 / 异常）
- **trace_id 链接**到 Langfuse Dashboard
- **可观测**全链路——**点链接看**完整 trace

### 4. **滚动行为**（useChatStream）
- **不打断**用户阅读——长消息不强制滚到底
- 新消息**平滑**滚动——**有**视觉提示

## 🏗️ 架构

```
                    ┌──────────────────┐
                    │   ChatInput      │  ← 用户输入
                    └────────┬─────────┘
                             ↓
                    ┌──────────────────┐
                    │  useChatStream   │  ← fetch + ReadableStream
                    │  (SSE 消费)      │     解析 4 事件
                    └────────┬─────────┘
                             ↓
                ┌────────────┼────────────┐
                ↓            ↓            ↓
       ┌─────────────┐ ┌──────────┐ ┌──────────────┐
       │ ChatMessage │ │ ToolCall │ │  StatusBar   │
       │             │ │  Card    │ │ (trace_id)   │
       └─────────────┘ └──────────┘ └──────────────┘
                ↓
       ┌─────────────────────────────┐
       │  useTypewriter              │  ← 打字机渲染
       │  (逐字输出)                  │
       └─────────────────────────────┘
```

## 📂 项目结构

```
secops-copilot-web/
├── public/                       # 静态资源
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── assets/                   # 图片资源
│   │   ├── hero.png
│   │   ├── react.svg
│   │   └── vite.svg
│   ├── components/               # 组件
│   │   ├── ChatInput.tsx         # 输入框
│   │   ├── ChatMessage.tsx       # 消息渲染
│   │   ├── StatusBar.tsx         # 状态栏
│   │   └── ToolCallCard.tsx      # 工具调用卡片
│   ├── hooks/                    # 自定义 Hooks
│   │   ├── useChatStream.ts      # SSE 流式消费
│   │   └── useTypewriter.ts      # 打字机效果
│   ├── types/                    # TypeScript 类型
│   │   └── events.ts             # 4 事件 union
│   ├── App.tsx                   # 根组件
│   ├── main.tsx                  # 入口
│   └── index.css                 # 全局样式
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── Dockerfile
└── README.md
```

## 🚀 快速开始

### 前置要求

- Node.js 20+
- [pnpm](https://pnpm.io/) / npm / yarn

### 安装

```bash
# 1. 克隆
git clone https://github.com/xxx/secops-copilot-web.git
cd secops-copilot-web

# 2. 安装依赖
pnpm install
# 或 npm install / yarn install
```

### 启动开发模式

```bash
# 默认代理到 http://localhost:8000 (后端)
pnpm dev
# 或 npm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
pnpm build
# 产物在 dist/
```

## 🔌 SSE 事件协议

### 4 个事件类型

| 事件 | 触发时机 | 字段 |
|------|---------|------|
| `thinking_start` | ReAct 循环每轮开始 | `iteration, query` |
| `tool_call` | LLM 决定调用工具 | `name, args, call_id` |
| `tool_result` | 工具返回 | `name, result_preview, call_id` |
| `final_answer` | 循环结束 | `content, sources, trace_id` |

### 消费方式（fetch + ReadableStream）

```typescript
const response = await fetch('/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '如何检测 DOM 型 XSS？' })
})

const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const chunk = decoder.decode(value)
  // 解析 SSE 格式：data: {...}\n\n
}
```

**为什么不使用 EventSource**？
- EventSource **只**支持 GET——后端是 POST
- fetch + ReadableStream 是**唯一**能 POST 又**流式**的方案

## 🎨 关键设计决策

### 1. **打字机效果**

```typescript
// useTypewriter: 逐字渲染
const [displayed, setDisplayed] = useState('')
useEffect(() => {
  if (displayed.length < fullText.length) {
    const timer = setTimeout(() => {
      setDisplayed(fullText.slice(0, displayed.length + 1))
    }, 30) // 30ms/字
    return () => clearTimeout(timer)
  }
}, [displayed, fullText])
```

**为什么**：用户**看到** AI **在思考**——**降低**等待焦虑

### 2. **工具调用配对**（call_id）

```typescript
// tool_call 和 tool_result 用 call_id 配对
tool_call.call_id === tool_result.call_id
```

**关键**：后端**必须** `call_id: tool_call.id`——**前端**配对**靠**这个

### 3. **trace_id 链接**

```typescript
// final_answer 事件带 trace_id
<StatusBar trace_id={finalAnswer.trace_id} />
// 点击跳转到 Langfuse Dashboard
window.open(`https://cloud.langfuse.com/trace/${trace_id}`)
```

**为什么**：用户**点**消息**能看**完整 trace——**可观测**

## 🛠️ 技术栈

- **框架**：React 18 + TypeScript 5
- **构建**：Vite 5
- **样式**：Tailwind CSS
- **流式**：SSE（fetch + ReadableStream）
- **部署**：Docker（多阶段构建）

## 📝 License

MIT

---

## 🤝 配套仓库

- **后端**：[secops-copilot-backend](https://github.com/sec-8/secops-copilot)
- **演示 Demo GIF**：[链接待补]
