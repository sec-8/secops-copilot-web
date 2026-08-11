// SSE 事件类型（跟后端 main.py 的 chat_stream 端点对齐）
//
// 4 个事件类型（Q27 中粒度设计）：
//   - thinking_start: ReAct 循环每轮开始
//   - tool_call: LLM 决定调用工具
//   - tool_result: 工具返回
//   - final_answer: 循环结束

export interface ThinkingStartEvent {
  type: "thinking_start"
  iteration: number
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

export type ChatEvent =
  | ThinkingStartEvent
  | ToolCallEvent
  | ToolResultEvent
  | FinalAnswerEvent

// UI 状态：当前正在做什么（驱动 StatusBar）
export type ChatStatus =
  | "idle"        // 等待用户输入
  | "thinking"    // ReAct 循环中
  | "tool_call"   // 调用工具
  | "done"        // 结束
  | "error"       // 错误

// 工具调用对（tool_call + tool_result 配对）
export interface ToolPair {
  name: string
  args: Record<string, unknown>
  result?: string
  call_id?: string
}
