// 主聊天界面（A 方案：过程 + 结果 单一滚动流）
// 主区从上到下：用户问题（echo）→ 工具调用气泡 × N → finalAnswer 气泡
// 右侧 aside 已去掉（ToolCallCard 在主区显示，不重复）
// Q1 配套：StatusBar fixed top-14
// Q3 配套：finalAnswer 走打字机

import { useState, useRef, useEffect } from "react"
import { useChatStream } from "./hooks/useChatStream"
import { ChatMessage } from "./components/ChatMessage"
import { ChatInput } from "./components/ChatInput"
import { ToolCallCard } from "./components/ToolCallCard"
import { StatusBar } from "./components/StatusBar"
import { useTypewriter } from "./hooks/useTypewriter"

const LANGFUSE_HOST = "https://cloud.langfuse.com"

function App() {
  const {
    status,
    toolCalls,
    finalAnswer,
    sources,
    traceId,
    error,
    send,
    reset,
    lastUserInput, // 用于在主区回显用户问题
  } = useChatStream()

  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)  // 主区滚劥容器（检测“是否在底部”用）
  // 用户是否“在底部”：是 → 打字机自动跟随；否 → 不打拢用户
  const stickToBottomRef = useRef(true)

  // 折叠状态：key 是工具的 call_id（用 index 兜底）
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // 记录是否已经自动折叠过（避免后续 finalAnswer 更新时反复重置）
  const autoCollapsedRef = useRef(false)

  const handleSend = () => {
    if (!input.trim()) return
    send(input)
    setInput("")
    // 刚发了新问题 → 滚到底（用户期待看新结果）
    stickToBottomRef.current = true
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

  // Q3 打字机：25ms/字（胖哥评估：比 100ms 紧张感强但能跟上）
  const typedAnswer = useTypewriter(finalAnswer ?? "", 20)

  // finalAnswer 一到，自动折叠所有工具卡（仅一次，记住用户后续选择）
  useEffect(() => {
    if (finalAnswer && !autoCollapsedRef.current && toolCalls.length > 0) {
      const allKeys = new Set(
        toolCalls.map((tc, i) => (tc as any).call_id ?? String(i))
      )
      setCollapsed(allKeys)
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
      {/* ===== 顶部 Header ===== */}
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
          <button
            onClick={reset}
            className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100"
          >
            清空
          </button>
        </div>
      </header>

      {/* ===== 状态栏（Q1 fixed） ===== */}
      <StatusBar status={status} error={error} />

      {/* ===== 主区：单一滚动流（A 方案）=====
          - 顶：用户问题（如果有 lastUserInput）
          - 中：工具调用气泡 × N（过程，Q3 默认不参与打字机）
          - 底：finalAnswer 气泡（结果，Q3 打字机）
          - pt-[50px] 让出 Header+StatusBar
          - pb-24 让出底部输入框
      */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto nice-scroll pt-[50px] pb-24"
      >
        <div className="max-w-3xl mx-auto px-6 py-4 space-y-4">
          {/* 用户问题回显 */}
          {lastUserInput && (
            <ChatMessage role="user" content={lastUserInput} />
          )}

          {/* 思考中 / 工具调用中 / 出错 占位（无 finalAnswer 时显示） */}
          {!finalAnswer && status === "thinking" && (
            <div className="flex items-center gap-2 text-sm text-slate-500 italic">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              思考中...
            </div>
          )}

          {!finalAnswer && status === "error" && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
              <div className="font-semibold mb-1">出错了</div>
              <div className="text-xs">{error}</div>
            </div>
          )}

          {!finalAnswer && status === "idle" && !lastUserInput && (
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

          {/* 工具调用气泡 × N（过程，在 finalAnswer 之前）
              联动折叠：finalAnswer 出现 → 工具调用自动折叠 */}
          {toolCalls.map((tc, i) => {
            const key = (tc as any).call_id ?? String(i)
            return (
              <ToolCallCard
                key={key}
                tool={tc}
                index={i + 1}
                collapsed={collapsed.has(key)}
                onToggle={() => {
                  setCollapsed((prev) => {
                    const next = new Set(prev)
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  })
                }}
              />
            )
          })}

          {/* 思考中 + 有工具：显示"还在执行工具 N..."提示 */}
          {status === "tool_call" && toolCalls.length > 0 && !finalAnswer && (
            <div className="flex items-center gap-2 text-xs text-amber-700 italic">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              正在执行工具...
            </div>
          )}

          {/* finalAnswer（结果，最下）
              scroll-mb-24：滚到底时底部留 96px 空间，被 fixed 输入框不挡 */}
          {finalAnswer && (
            <ChatMessage
              role="assistant"
              content={typedAnswer}
              sources={sources}
              isTyping={typedAnswer.length < finalAnswer.length}
            />
          )}

          <div ref={bottomRef} className="h-1 scroll-mb-24" />
        </div>
      </main>

      {/* ===== 底部输入区（fixed） ===== */}
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
