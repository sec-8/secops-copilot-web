// SSE 消费 Hook（用 fetch + ReadableStream，不用 EventSource）
//
// 为什么不用 EventSource？
//   - EventSource 只支持 GET
//   - 后端是 POST /chat/stream
//   - fetch + ReadableStream 是唯一能 POST 又流式的方案
//
// 用法：
//   const { status, toolCalls, finalAnswer, error, send, reset } = useChatStream()
//   send("如何检测 DOM 型 XSS？")

import { useState, useCallback, useRef } from "react"
import type { ChatEvent, ChatStatus, ToolPair } from "../types/events"

const SSE_ENDPOINT = "/chat/stream"

export function useChatStream() {
  const [status, setStatus] = useState<ChatStatus>("idle")
  const [toolCalls, setToolCalls] = useState<ToolPair[]>([])
  const [finalAnswer, setFinalAnswer] = useState<string>("")
  const [sources, setSources] = useState<string[]>([])
  const [traceId, setTraceId] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [lastUserInput, setLastUserInput] = useState<string>("")  // A 方案：主区回显用户问题

  // 用 ref 防止用户连点（in-flight 保护）
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(async (text: string) => {
    if (!text.trim()) return
    if (abortRef.current) {
      // 上一次还没结束，先 abort
      abortRef.current.abort()
    }

    // 重置状态
    setStatus("thinking")
    setToolCalls([])
    setFinalAnswer("")
    setSources([])
    setTraceId("")
    setError("")
    setLastUserInput(text)  // A 方案：记录本次问题用于主区回显

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch(SSE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      if (!response.body) {
        throw new Error("response.body is null")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        // SSE 协议：每个事件以 \n\n 结束
        // 一次 read 可能拿到多个事件，也可能半个事件
        const parts = buffer.split("\n\n")
        buffer = parts.pop() || ""  // 最后一个可能不完整，留给下次

        for (const part of parts) {
          if (!part.trim()) continue
          // 每行 "data: {...}"
          for (const line of part.split("\n")) {
            if (!line.startsWith("data: ")) continue
            const json = line.slice(6)
            try {
              const event: ChatEvent = JSON.parse(json)
              handleEvent(event, {
                setStatus,
                setToolCalls,
                setFinalAnswer,
                setSources,
                setTraceId,
              })
            } catch (e) {
              console.error("parse SSE event failed:", json, e)
            }
          }
        }
      }

      // 正常结束
      setStatus((s) => (s === "error" ? "error" : "done"))
    } catch (e: any) {
      if (e.name === "AbortError") {
        // 用户主动取消，不算 error
        setStatus("idle")
        return
      }
      console.error("SSE error:", e)
      setError(e.message || "unknown error")
      setStatus("error")
    } finally {
      abortRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    setStatus("idle")
    setToolCalls([])
    setFinalAnswer("")
    setSources([])
    setTraceId("")
    setError("")
    setLastUserInput("")
  }, [])

  return { status, toolCalls, finalAnswer, sources, traceId, error, send, reset, lastUserInput }
}

// 事件分发：每次 SSE 事件过来，更新对应的 state
function handleEvent(
  event: ChatEvent,
  setters: {
    setStatus: (s: ChatStatus) => void
    setToolCalls: React.Dispatch<React.SetStateAction<ToolPair[]>>
    setFinalAnswer: (s: string) => void
    setSources: (s: string[]) => void
    setTraceId: (s: string) => void
  }
) {
  switch (event.type) {
    case "thinking_start":
      setters.setStatus("thinking")
      break
    case "tool_call":
      setters.setStatus("tool_call")
      setters.setToolCalls((prev) => [
        ...prev,
        {
          name: event.name,
          args: event.args,
          call_id: event.call_id,
        },
      ])
      break
    case "tool_result":
      setters.setStatus("tool_call")  // 还在工具阶段
      setters.setToolCalls((prev) => {
        // 优先按 call_id 配对；没 call_id 则按“最后一处未完成” 兑底
        const matched = prev.findIndex(
          (tc) =>
            !tc.result &&
            ((tc.call_id && event.call_id && tc.call_id === event.call_id) ||
              (!tc.call_id || !event.call_id))
        )
        if (matched === -1) return prev
        const next = [...prev]
        next[matched] = { ...next[matched], result: event.result }
        return next
      })
      break
    case "final_answer":
      setters.setStatus("done")
      setters.setFinalAnswer(event.content)
      if (event.sources) setters.setSources(event.sources)
      if (event.trace_id) setters.setTraceId(event.trace_id)
      break
  }
}
