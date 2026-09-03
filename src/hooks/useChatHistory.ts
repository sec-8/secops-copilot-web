import { useState, useEffect, useCallback } from "react"
import type { ToolPair } from "../types/events"
export interface HistoryMessage {
  role: "user" | "ai"
  content: string
  tool_calls?: ToolPair[]
}

type Version = "v1" | "v2"

export const useChatHistory = (userId: string, sessionId: string, version: Version = "v2") => {
  const [messages, setMessages] = useState<HistoryMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>("")

  const load = useCallback(async () => {
    // v1 无 history 端点 → 直接置空，不发请求
    if (version === "v1") {
      setMessages([])
      setLoading(false)
      return
    }
    setLoading(true)
    // 拉之前先清空，避免跨用户复用上一个用户的数据
    setMessages([])
    setError("")
    try {
      const response = await fetch(
        `/chat/history?user_id=${userId}&session_id=${sessionId}`
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setMessages(data.messages || [])
    } catch (e: any) {
      console.error("[useChatHistory] fetch 失败, userId:", userId, "error:", e.message)
      setError(e.message || "历史数据拉取失败")
    } finally {
      setLoading(false)
    }
  }, [userId, sessionId, version])

  useEffect(() => {
    if (userId && sessionId) load()
  }, [load, userId, sessionId])

  return { messages, loading, error, refresh: load }
}
