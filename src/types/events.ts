// SSE 事件类型（跟后端 main.py 的 chat_stream 端点对齐）
//
// 4 个事件类型：
//   - thinking_start: ReAct 循环每轮开始
//   - tool_call: LLM 决定调用工具
//   - tool_result: 工具返回
//   - final_answer: 循环结束

export interface ThinkingStartEvent {
  type: "thinking_start"
  iteration: number
  // 细化状态：可选的人类可读阶段标签（如“Supervisor 分派中”）
  // v1 后端不发 → StatusBar 回退到默认“思考中...”
  label?: string
}

export interface ToolCallEvent {
  type: "tool_call"
  name: string
  args: Record<string, unknown>
  // 工具调用的唯一 id（用于配对 tool_result）
  call_id?: string
}

export interface ToolResultEvent {
  type: "tool_result"
  name: string
  result: string
  // 配对的 tool_call id
  call_id?: string
}

export interface FinalAnswerEvent {
  type: "final_answer"
  content: string
  sources?: string[]
  trace_id?: string
}

// TokenEvent
export interface TokenEvent {
  type: "token"
  content: string
  call_id?: string  // 跟 final_answer 配对
}

export type ChatEvent =
  | ThinkingStartEvent
  | ToolCallEvent
  | ToolResultEvent
  | TokenEvent         
  | FinalAnswerEvent

// UI 状态：当前正在做什么（驱动 StatusBar）
export type ChatStatus =
  | "idle"        // 等待用户输入
  | "thinking"    // ReAct 循环中
  | "tool_call"   // 调用工具
  | "done"        // 结束
  | "error"       // 错误

// 细化状态：thinking 阶段的 label 由 useChatStream 单独存 statusLabel，
// 不改 ChatStatus 联合类型（爆炸半径小：StatusBar 加可选 label prop 即可）

// 工具调用对（tool_call + tool_result 配对）
export interface ToolPair {
  name: string
  args: Record<string, unknown>
  result?: string
  call_id?: string
}

// 消息类型（前端全量渲染的统一数据模型）
export interface Message {
  id: string                  // uuid，React key
  role: "user" | "ai"         // 发送方
  content: string             // 用户问题 / AI 最终答案
  toolCalls?: ToolPair[]      // AI 这条消息的 tool 调用过程（v2 多 tool 支持）
  sources?: string[]          // RAG 引用
  traceId?: string            // Langfuse trace
  isStreaming?: boolean       // 是否正在流（true = 占位未完成）
  createdAt: number           // 时间戳
}
