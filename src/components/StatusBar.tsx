// 状态栏（Header 下面那一条）
// 状态色 + 动效（呼吸灯/进度条/光圈不同时动）

import type { FC } from "react"
import type { ChatStatus } from "../types/events"

interface Props {
  status: ChatStatus
  error?: string
}

const STATUS_MAP: Record<
  ChatStatus,
  { text: string; textColor: string; bg: string; dot: string; ring: string }
> = {
  idle: {
    text: "空闲",
    textColor: "text-slate-500",
    bg: "bg-slate-50",
    dot: "bg-slate-400",
    ring: "",
  },
  thinking: {
    text: "思考中...",
    textColor: "text-indigo-700",
    bg: "bg-indigo-50",
    dot: "bg-indigo-500",
    ring: "animate-ping opacity-50",
  },
  tool_call: {
    text: "调用工具",
    textColor: "text-amber-700",
    bg: "bg-amber-50",
    dot: "bg-amber-500",
    ring: "animate-pulse opacity-60",
  },
  done: {
    text: "已完成",
    textColor: "text-emerald-700",
    bg: "bg-emerald-50",
    dot: "bg-emerald-500",
    ring: "",
  },
  error: {
    text: "出错了",
    textColor: "text-red-700",
    bg: "bg-red-50",
    dot: "bg-red-500",
    ring: "animate-pulse",
  },
}

export const StatusBar: FC<Props> = ({ status, error }) => {
  const meta = STATUS_MAP[status]
  return (
    <div
        className={`fixed top-14 left-0 right-0 z-10 ${meta.bg} backdrop-blur border-b border-slate-200 px-6 py-2 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]`}
      >
        {/* 状态点：呼吸灯（仅 thinking / tool_call） */}
        <div className="relative w-2 h-2 shrink-0">
          <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
          {meta.ring && (
            <div
              className={`w-2 h-2 rounded-full ${meta.dot} ${meta.ring} absolute inset-0`}
            />
          )}
        </div>
        <span className={`text-xs font-medium ${meta.textColor}`}>
          {meta.text}
        </span>

        {/* 思考中：底部进度条 */}
        {(status === "thinking" || status === "tool_call") && (
          <div className="flex-1 max-w-xs h-0.5 bg-slate-200/60 rounded overflow-hidden">
            <div
              className={`h-full rounded animate-progress ${
                status === "thinking" ? "bg-indigo-500" : "bg-amber-500"
              }`}
            />
          </div>
        )}

        {/* error 详情 */}
        {status === "error" && error && (
          <span className="text-xs text-red-500 ml-2 truncate">
            — {error}
          </span>
        )}

        {/* 完成态：trace 摘要 */}
        {status === "done" && (
          <span className="text-xs text-slate-400 ml-2">
            完整 trace 见 Header 链接
          </span>
        )}
      </div>
  )
}
