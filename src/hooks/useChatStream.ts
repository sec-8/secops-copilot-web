// SSE 消费 Hook（用 fetch + ReadableStream，不用 EventSource）
//
// 为什么不用 EventSource？
//   - EventSource 只支持 GET
//   - 后端是 POST /chat/stream
//   - fetch + ReadableStream 是唯一能 POST 又流式的方案
//
// 用法：
//   const { status, toolCalls, finalAnswer, error, send, reset } = useChatStream("v2")
//   send("如何检测 DOM 型 XSS？")
//
// v1/v2 差异：
//   - v1: 端点 = /chat/stream（无记忆，无 RAG 增强），事件字段名原生
//   - v2: 端点 = /v2/chat/stream（多 agent + 记忆），事件字段名归一化（content/citations/call_id）

import { useState, useCallback, useRef } from "react"
import type { ChatEvent, ChatStatus, ToolPair } from "../types/events"

type Version = "v1" | "v2"

export const useChatStream = (version: Version = "v2") => {
  // SSE 端点：v1 = /chat/stream（无记忆），v2 = /v2/chat/stream（多 agent + 记忆）
  const SSE_ENDPOINT = version === "v2" ? "/v2/chat/stream" : "/chat/stream"

  // v1/v2 字段归一化
  // v1：透传（后端字段名就是 ChatEvent 标准）
  // v2：字段名不统一 → 归一化
  //   - token / final_answer 用 content
  //   - tool_result 用 result
  //   - sources 在 citations
  //   - call_id 在 event.call_id 或 args.call_id
  const normalize = (event: any) => {
    if (version === "v1") {
      return event  // 透传
    }
    return {
      type: event.type,
      name: event.name,
      args: event.args,
      content: event.content ?? event.content_preview ?? "",
      sources: event.citations ?? [],
      call_id: event.call_id ?? event.args?.call_id,
      citations: event.citations,
      has_answer: event.has_answer,
      trace_id: event.trace_id,
      result: event.result,
      label: event.label,
    }
  }

  // 事件分发（每次 SSE 事件过来，更新对应 state）
  // 放在 hook 内部 = 闭包捕获 version/normalize，无需参数传递
  const handleEvent = (
    rawevent: any,
    setters: {
      setStatus: (s: ChatStatus) => void
      setStatusLabel: (s: string | null) => void
      setToolCalls: React.Dispatch<React.SetStateAction<ToolPair[]>>
      setFinalAnswer: (s: string) => void
      setSources: (s: string[]) => void
      setTraceId: (s: string) => void
      setTokens: React.Dispatch<React.SetStateAction<string[]>>
      setLiveAnswer: React.Dispatch<React.SetStateAction<string>>
      setError: (s: string) => void
    }
  ) => {
    const event = normalize(rawevent)

    switch (event.type) {
      case "thinking_start":
        setters.setStatus("thinking")
        setters.setStatusLabel(event.label ?? null)
        break
      case "tool_call":
        setters.setStatus("tool_call")
        setters.setToolCalls((prev) => {
          const last = prev[prev.length - 1]
          // 挡紧邻重发：与上一张完全相同（call_id+name+args）且尚未收到 result
          // 后端串行 await，收到 result 才发下一个 call → 同参数连续两次不可能是合法流程
          if(
            last && 
            last.call_id === event.call_id &&
            last.name === event.name &&
            last.result === undefined &&
            JSON.stringify(last.args ?? {}) === JSON.stringify(event.args ?? {})
          ){
            return prev
          }
          return [
            ...prev,
            {
              name: event.name,
              args: event.args,
              call_id: event.call_id,
            },
          ]
        })
        break
      case "tool_result":
        setters.setToolCalls((prev) => {
          // 优先按 call_id 配对；没 call_id 则按 name 兜底
          const matched = prev.findIndex(
            (tc) => tc.call_id === event.call_id && tc.result === undefined
          )
          if (matched === -1) {
            const fallback = prev.findIndex(
              (tc) => tc.name === event.name && tc.result === undefined
            )
            if (fallback === -1) return prev
            const next = [...prev]
            next[fallback] = { ...next[fallback], result: event.result }
            return next
          }
          const next = [...prev]
          next[matched] = { ...next[matched], result: event.result }
          return next
        })
        setters.setStatus("thinking")
        setters.setStatusLabel(null)
        break
      case "token":
        setters.setLiveAnswer((prev) => prev + event.content)
        setters.setTokens((prev) => [...prev, event.content])
        break
      case "final_answer":
        setters.setStatus("done")
        setters.setStatusLabel(null)
        setters.setFinalAnswer(event.content)
        // 不清 liveAnswer，保留 token 累加，让打字机自然追到 finalAnswer 长度
        if (event.sources) setters.setSources(event.sources)
        if (event.trace_id) setters.setTraceId(event.trace_id)
        break
      case "error":
        setters.setError(event.content || "unknown error")
        setters.setStatus("error")
        setters.setStatusLabel(null)
        break
    }
  }

  const [status, setStatus] = useState<ChatStatus>("idle")
  // 细化状态：thinking 阶段的 label（如“拆解子问题中”），null = 回退默认文案
  const [statusLabel, setStatusLabel] = useState<string | null>(null)
  const [toolCalls, setToolCalls] = useState<ToolPair[]>([])
  const [finalAnswer, setFinalAnswer] = useState<string>("")
  const [sources, setSources] = useState<string[]>([])
  const [traceId, setTraceId] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [tokens, setTokens] = useState<string[]>([])
  const [liveAnswer, setLiveAnswer] = useState<string>("")  // 实时拼接

  // 用 ref 防止用户连点（in-flight 保护）
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(async (text: string, userId: string, sessionId: string) => {
    if (!text.trim()) return
    if (abortRef.current) {
      // 上一次还没结束，先 abort
      abortRef.current.abort()
    }

    // 重置状态
    setStatus("thinking")
    setStatusLabel(null)
    setToolCalls([])
    setFinalAnswer("")
    setSources([])
    setTraceId("")
    setError("")
    setTokens([])
    setLiveAnswer("")

    const controller = new AbortController()
    abortRef.current = controller

    // send 必须随 version 变化重建，不能锁死在首次挂载的闭包里
    // 这样切 v1/v2 后，下一次 send 才会用新 endpoint + 新 normalize
    const endpoint = SSE_ENDPOINT
    const handle = handleEvent

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-ID": userId },
        body: JSON.stringify({ text, user_id: userId, session_id: sessionId }),
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
        const parts = buffer.split("\n\n")
        buffer = parts.pop() || ""  // 最后一个可能不完整，留给下次

        for (const part of parts) {
          if (!part.trim()) continue
          for (const line of part.split("\n")) {
            if (!line.startsWith("data: ")) continue
            const json = line.slice(6)
            try {
              const event: ChatEvent = JSON.parse(json)
              handle(event, {
                setStatus,
                setStatusLabel,
                setToolCalls,
                setFinalAnswer,
                setSources,
                setTraceId,
                setTokens,
                setLiveAnswer,
                setError
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
        setStatus("idle")
        return
      }
      console.error("SSE error:", e)
      setError(e.message || "unknown error")
      setStatus("error")
    } finally {
      abortRef.current = null
    }
  }, [SSE_ENDPOINT, handleEvent])

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    setStatus("idle")
    setStatusLabel(null)
    setToolCalls([])
    setFinalAnswer("")
    setSources([])
    setTraceId("")
    setError("")
  }, [])

  return { status, statusLabel, toolCalls, finalAnswer, sources, traceId, error, send, reset,
    tokens, liveAnswer }
}
