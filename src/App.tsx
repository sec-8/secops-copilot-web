// 主聊天界面（过程 + 结果 单一滚动流）
// 主区从上到下：用户问题（echo）→ 工具调用气泡 × N → finalAnswer 气泡
// 右侧 aside 已去掉（ToolCallCard 在主区显示，不重复）
// StatusBar fixed top-14
// finalAnswer 走打字机

import { useState, useRef, useEffect } from "react"
import { useChatStream } from "./hooks/useChatStream"
import { useChatHistory } from "./hooks/useChatHistory"
import { ChatMessage } from "./components/ChatMessage"
import { ChatInput } from "./components/ChatInput"
import { ToolCallCard } from "./components/ToolCallCard"
import { StatusBar } from "./components/StatusBar"
import { useTypewriter } from "./hooks/useTypewriter"
import { UserSwitcher } from "./components/UserSwitcher"
import type { Message } from "./types/events"
import type { HistoryMessage } from "./hooks/useChatHistory"

const LANGFUSE_HOST = "https://cloud.langfuse.com"

function App() {
  const [input, setInput] = useState("")
  // localStorage 存 user_id（首次访问用 use_1 默认）
  const [userId, setUserId] = useState(() => {
    // localStorage（非 sessionStorage）：页签关闭不丢，跨页签共享
    // 之前用 sessionStorage：关页签/开新页签 → 钥匙丢了，Redis 里 24h 的对话还在但拉不回
    let id = localStorage.getItem("secops_user_id")
    if(!id) {
      id = "use_1"  // 默认小胖（3 固定用户中的第一个）
      localStorage.setItem("secops_user_id", id)
    }
    return id
  })
  // sessionId 存 localStorage：会话语义从“页签级”变“浏览器级”，关页签重开能接上之前的对话
  const [sessionId] = useState(() => {
    let id = localStorage.getItem("secops_session_id")
    if(!id) {
      id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem("secops_session_id", id)
    }
    return id
  })
  // v1/v2 切换：默认 v2（v2 有多 agent + 记忆）
  // v1: ReAct 循环 + 4 tier 降级，无记忆
  // v2: Multi-Agent (Supervisor + RAG + Tool + Memory) + 记忆
  const [version, setVersion] = useState<"v1" | "v2">(() => {
    const v = sessionStorage.getItem("secops_version")
    return (v === "v1" || v === "v2") ? v : "v2"
  })
  const {
    status,
    statusLabel,
    toolCalls,
    liveAnswer,
    finalAnswer,
    sources,
    traceId,
    error,
    send,
    reset,
  } = useChatStream(version)
  const { messages: historyMessages, loading: historyLoading  } = useChatHistory(userId, sessionId, version)

  // ============  messages 累积分周  ============
  //  source of truth：所有 问 A / 答 A / 问 B / 答 B 都累积在这里
  //  初始化： historyMessages 拉来后装入，仅首次加载
  //  增量： user 发送 = push user，ai 流完成 = push ai
  const [messages, setMessages] = useState<Message[]>([])
  //  累计 toolCalls 到 current streaming ai message（占位）
  const [streamingToolCalls, setStreamingToolCalls] = useState<import("./types/events").ToolPair[]>([])

  //  初始化： historyMessages 拉到了 + messages 还未初始化 → 装入
  //  historyMessages 引用当触发器，不要看 historyLoading（避免 stale data 装入）
  //  用 userId + historyMessages 引用判断“装没装过这一版 historyMessages”
  const lastLoadedRef = useRef<{ userId: string; historyRef: HistoryMessage[] } | null>(null)
  useEffect(() => {
    //  装过这一版 historyMessages（同一 userId + 同一 historyMessages 引用）→ 跳过
    if (
      lastLoadedRef.current &&
      lastLoadedRef.current.userId === userId &&
      lastLoadedRef.current.historyRef === historyMessages
    ) return
    //  还在拉（historyLoading=true）→ 等
    if (historyLoading) return
    //  装入（length=0 也装：保证 ref 被设，避免跨用户判断错乱）
    setMessages(historyMessages.map(m => ({
      id: crypto.randomUUID(),
      role: m.role === "user" ? "user" : "ai",
      content: m.content,
      toolCalls: m.tool_calls || [],
      createdAt: Date.now(),
    })))
    lastLoadedRef.current = { userId, historyRef: historyMessages }
  }, [historyMessages, historyLoading, userId])

  //  监听 ai 流式 toolCalls → 更新到 streamingToolCalls
  useEffect(() => {
    if (toolCalls.length > 0) {
      setStreamingToolCalls(toolCalls)
    }
  }, [toolCalls])

  //  监听 finalAnswer 出现（流完成）→ update 最后一条 ai message（不是 push 新的）
  useEffect(() => {
    if (finalAnswer && (status === "done" || status === "idle")) {
      setMessages(prev => {
        const lastIdx = prev.length - 1
        // 最后一条是 ai（占位）→ update 它
        if (lastIdx >= 0 && prev[lastIdx].role === "ai") {
          if (prev[lastIdx].content === finalAnswer) return prev  // 避免重复
          const next = [...prev]
          next[lastIdx] = {
            ...next[lastIdx],
            content: finalAnswer,
            toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : toolCalls,
            sources: sources,
            traceId: traceId,
          }
          return next
        }
        // 最后一条不是 ai（异常）→ push 新的
        return [...prev, {
          id: crypto.randomUUID(),
          role: "ai",
          content: finalAnswer,
          toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : toolCalls,
          sources: sources,
          traceId: traceId,
          createdAt: Date.now(),
        }]
      })
    }
  }, [finalAnswer, status])
  
  const bottomRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)  // 主区滚动容器（检测“是否在底部”用）
  // 用户是否“在底部”：是 → 打字机自动跟随；否 → 不打拢用户
  const stickToBottomRef = useRef(true)

  // 折叠状态：key 是工具的 call_id（用 index 兜底）
  const [forceCollapsed, setForceCollapsed] = useState(false)
  // 标记是否已经自动折叠过一次
  const autoCollapsedRef = useRef(false)

  const handleSend = () => {
    if (!input.trim()) return
    const text = input
    send(text, userId, sessionId)
    setInput("")
    // 刚发了新问题 → 滚到底（用户期待看新结果）
    stickToBottomRef.current = true
    setForceCollapsed(false)        // 新一轮过程要能看到实时检索
    autoCollapsedRef.current = false  // 重置自动折叠标记
    // handleSend 每次 send 必产生新消息对，重复问题/连发/快速连点全部正确
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text, toolCalls: [], createdAt: Date.now() },
      { id: crypto.randomUUID(), role: "ai", content: "", toolCalls: [], createdAt: Date.now() },
    ])
    // 流开始 → 重置 streaming toolCalls
    setStreamingToolCalls([])
  }

  // 用户主动滚动 = 立即解锁 “跟到底” （不靠 onScroll 异步）
  // 事件：wheel（鼠标滚轮）、touchstart（手机）、mousedown（拖滚动条）、keydown（空格/PageDown）
  useEffect(() => {
    const lock = () => { stickToBottomRef.current = false }
    window.addEventListener("wheel", lock, { passive: true })
    window.addEventListener("touchstart", lock, { passive: true })
    window.addEventListener("mousedown", lock)
    window.addEventListener("keydown", lock)
    return () => {
      window.removeEventListener("wheel", lock)
      window.removeEventListener("touchstart", lock)
      window.removeEventListener("mousedown", lock)
      window.removeEventListener("keydown", lock)
    }
  }, [])

  const traceUrl = traceId ? `${LANGFUSE_HOST}/trace/${traceId}` : ""

  // 打字机：25ms/字
  // 返回 [typedAnswer, typedDone]，typedDone=true 表示打字机已追完
  const [typedAnswer, typedDone] = useTypewriter(liveAnswer || finalAnswer, 25)

  // finalAnswer 一到，自动折叠所有工具卡（仅一次，记住用户后续选择）
  useEffect(() => {
    if (finalAnswer && toolCalls.length > 0 && !autoCollapsedRef.current) {
      setForceCollapsed(true)
      autoCollapsedRef.current = true
    }
    // finalAnswer 刚到时 也重置“跟到底”状态（新内容出现，用户可能想看）
    if (finalAnswer) {
      stickToBottomRef.current = true
    }
  }, [finalAnswer, toolCalls])

  // 自动滚动：仅在“用户在底部”时跟随新内容
  // behavior: "auto" 不是 "smooth" ：smooth 是异步的，打字机每字都 smooth 会一直打断用户
  useEffect(() => {
    if (!stickToBottomRef.current) return
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
  }, [typedAnswer, toolCalls])

  // 监听主区滚动事件：计算是否在底部
  // 如果用户手动滚回底部 → 重置锁（重新“粘”回跟随）
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const onScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight
      // 距底 80px 内算“在底部”
      if (distanceFromBottom < 80) {
        stickToBottomRef.current = true
      }
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(()=>{
    const onStorage = () => {
      // storage 事件只在其他页签触发 → 跨页签同步用户切换
      const newId = localStorage.getItem("secops_user_id")
      if (newId && newId !== userId) {
        setUserId(newId)
        // 切用户 → 清 useChatStream 状态 + 累积消息
        reset()
        setMessages([])
        setStreamingToolCalls([])
        lastLoadedRef.current = null
      }
    }
    // 监听 localStorage 变化（跨页签）
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  },[userId, reset])

  // 切 version（v1 ↔ v2）→ 清状态 + 重拉 history
  const switchVersion = (v: "v1" | "v2") => {
    if (v === version) return
    sessionStorage.setItem("secops_version", v)
    setVersion(v)
    reset()  // 清 useChatStream
    setMessages([])  // 清累积消息
    setStreamingToolCalls([])
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
      {/* 顶部 Header */}
      <header className="bg-white/80 backdrop-blur border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div className="w-2 h-2 rounded-full bg-emerald-500 absolute inset-0 animate-ping opacity-75" />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">
            SecOps Copilot
          </h1>
          <span className="text-xs text-slate-500 hidden sm:inline">
            AI 安全研判助手
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* v1/v2 切换组件 */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5">
            <button
              onClick={() => switchVersion("v1")}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                version === "v1"
                  ? "bg-white text-slate-800 shadow-sm font-semibold"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              title="v1: ReAct 循环 + 4 tier 降级，无记忆"
            >
              v1
            </button>
            <button
              onClick={() => switchVersion("v2")}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                version === "v2"
                  ? "bg-indigo-600 text-white shadow-sm font-semibold"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              title="v2: Multi-Agent (Supervisor + RAG + Tool + Memory) + 记忆"
            >
              v2
            </button>
          </div>
          {traceUrl && (
            <a
              href={traceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50"
            >
              <span>查看完整 trace</span>
              <span>↗</span>
            </a>
          )}
          {/* v1 模式下 UserSwitcher 灰显（v1 无记忆）*/}
          {version === "v2" ? (
            <UserSwitcher userId={userId} onChange={setUserId} onSwitch={() => {
              // 切用户 → 清 useChatStream 状态 + messages + 初始化标记
              reset()
              setMessages([])
              setStreamingToolCalls([])
              lastLoadedRef.current = null  // 重置加载标记，让新用户 history 装入
            }} />
          ) : (
            <span
              className="text-xs text-slate-400 px-2 py-1 cursor-not-allowed"
              title="v1 模式无记忆能力，用户隔离不可用"
            >
              👤 {userId === "use_1" ? "小胖" : userId === "use_2" ? "小明" : userId === "use_3" ? "长安" : userId}
            </span>
          )}
          <button
            onClick={reset}
            className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100"
          >
            清空
          </button>
        </div>
      </header>

      {/* 状态栏（thinking 时透传后端 label，如“拆解子问题中”）*/}
      <StatusBar status={status} label={statusLabel ?? undefined} error={error} />

      {/* 主区：单一滚动流
          - 顶：用户问题（handleSend 直接 push）
          - 中：工具调用气泡 × N（过程，不参与打字机）
          - 底：finalAnswer 气泡（结果，打字机）
          - pt-[50px] 让出 Header+StatusBar
          - pb-24 让出底部输入框
      */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto nice-scroll pt-[50px] pb-24"
      >
        <div className="max-w-3xl mx-auto px-6 py-4 space-y-4">
          {/* 主渲染（使用 messages 数组）
              source of truth = messages
              - 初始化装入： historyMessages （仅一次）
              - 增量： user 发 = push user，ai 流完成 = push ai
              - 切用户： messages 清空 → 重装另一个用户的历史 */}
          {messages.map((msg) => {
            if (msg.role === "user") {
              return (
                <ChatMessage
                  key={msg.id}
                  role="user"
                  content={msg.content}
                />
              )
            }
            // ai: 工具调用 + finalAnswer（在同一气泡块里）
            const isLast = msg.id === messages[messages.length - 1].id
            const isStreaming = isLast && (status === "thinking" || status === "tool_call")
            //  决定显示哪段内容：
            //  - 正在流 + 是最后一条： 用 liveAnswer （打字机中）
            //  - 已完成（last 或中间）：用 msg.content
            //  - 最后一条但 finalAnswer 未推到 messages：暂用 liveAnswer
            let displayContent: string
            if (isStreaming) {
              displayContent = liveAnswer || ""
            } else if (isLast && !msg.content) {
              //  finalAnswer 刚到，push 还未生效 → 用 liveAnswer （会是空）
              displayContent = liveAnswer || ""
            } else {
              displayContent = msg.content
            }
            //  打字机：仅在“当前正在生成 / 刚生成完”的 AI 消息走打字机
            //  - 历史消息装入时 status=idle，直接显示完整 content
            //  - v2 token 流中 / v1 final_answer 到达后 status=done，打字机追到完
            const isCurrentAnswer = isLast && (status === "thinking" || status === "tool_call" || status === "done")
            const useTyped = isCurrentAnswer && (liveAnswer.length > 0 || displayContent.length > 0) && !typedDone
            const finalDisplay = useTyped ? typedAnswer : displayContent
            return (
              <div key={msg.id} className="space-y-3">
                {/* 工具调用（仅这轮 AI 消息的 toolCalls）*/}
                {/* 流中最后一条 ai → 实时显示 streamingToolCalls */}
                {((isStreaming || (isLast && !msg.content)) 
                  ? streamingToolCalls 
                  : (msg.toolCalls ?? [])
                ).map((tc, i) => {
                  const key = `${(tc as any).call_id ?? "tc"}_${i}`
                  const isHistory = !(isStreaming || (isLast && !msg.content))
                  return (
                    <ToolCallCard
                      key={key}
                      tool={tc}
                      index={i + 1}
                      defaultCollapsed={isHistory ? true : forceCollapsed} // 默认关闭 true是关闭，false是打开
                    />
                  )
                })}
                {/* 思考中占位（仅正在流的最后一条）*/}
                {isStreaming && status === "thinking" && (msg.toolCalls ?? []).length === 0 && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 italic">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    思考中...
                  </div>
                )}
                {/* 工具执行中提示 */}
                {isStreaming && status === "tool_call" && (msg.toolCalls ?? []).length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 italic">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    正在执行工具...
                  </div>
                )}
                {/* AI 最终答案（打字机仅在正在流的最后一条）*/}
                {finalDisplay && !finalDisplay.includes("[检索]") && (
                  <ChatMessage
                    role="assistant"
                    content={finalDisplay}
                    sources={msg.sources}
                    isTyping={useTyped && !typedDone}
                  />
                )}
              </div>
            )
          })}

          {/* 错误提示（流错误时）*/}
          {status === "error" && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
              <div className="font-semibold mb-1">出错了</div>
              <div className="text-xs">{error}</div>
            </div>
          )}

          {/* 空状态 */}
          {!historyLoading && messages.length === 0 && status === "idle" && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-4xl mb-3">🛡️</div>
              <div className="text-base text-slate-600 mb-1">
                SecOps Copilot
              </div>
              <div className="text-sm text-slate-400">
                发送一条安全相关问题开始
              </div>
              <div className="text-xs text-slate-400 mt-3 space-y-1">
                <div>· 如何检测 DOM 型 XSS？</div>
                <div>· 解析这条告警：{"{"}src_ip: 1.2.3.4, dst_port: 5601{"}"}</div>
                <div>· SQL 注入有哪些防御手段？</div>
              </div>
            </div>
          )}

          <div ref={bottomRef} className="h-1 scroll-mb-24" />
        </div>
      </main>

      {/* 底部输入区（fixed） */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur border-t border-slate-200 p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={status === "thinking" || status === "tool_call"}
          />
        </div>
      </footer>
    </div>
  )
}

export default App
