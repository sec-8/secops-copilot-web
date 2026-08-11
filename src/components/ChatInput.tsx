// 输入框 + 发送按钮
// 样式细节你填：聚焦边框、禁用态、占位符、按钮 hover

import type { FC } from "react"

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
}

export const ChatInput: FC<Props> = ({ value, onChange, onSend, disabled }) => {
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled) onSend()
        }}
        disabled={disabled}
        placeholder={
          disabled
            ? "AI 正在思考..."
            : "输入安全相关问题，回车发送"
        }
        className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 disabled:bg-slate-100"
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
      >
        发送
      </button>
    </div>
  )
}
