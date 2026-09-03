// 工具调用卡片
// 暗色：比 finalAnswer 暗一个层次（slate-50 底 + slate-500/600 文字）
// 折叠：6 行以上默认折叠，finalAnswer 开始打字时自动折叠全部（forceCollapsed）
import { useState, useEffect } from "react"
import type { FC } from "react"
import type { ToolPair } from "../types/events"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface Props {
  tool: ToolPair
  index: number
  defaultCollapsed?: boolean 
}

const PREVIEW_LINES = 2

export const ToolCallCard: FC<Props> = ({
  tool,
  index,
  defaultCollapsed = true,
}) => {
  const hasResult = tool.result !== undefined
  const statusColor = hasResult
    ? "bg-emerald-500/70"
    : "bg-amber-500 animate-pulse"
  const statusText = hasResult ? "已完成" : "执行中..."
  // 折叠状态：完全由用户控制（App.tsx 会在 finalAnswer 到达时自动默认折叠）
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const onToggle = () => setIsCollapsed(prev => !prev)

  // 结果预览
  const resultText = tool.result ?? ""
  const resultLines = resultText.split("\n")
  const needsCollapse = resultLines.length > PREVIEW_LINES
  const previewText = isCollapsed
    ? resultLines.slice(0, PREVIEW_LINES).join("\n")
    : resultText
  
    // 父组件信号变化时同步（比如 finalAnswer 到达 → 全部折叠）
  useEffect(() => {
    setIsCollapsed(defaultCollapsed)
  }, [defaultCollapsed])
  return (
    <div
      className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden opacity-90 card-enter"
      // 入场 stagger：同帧到达的多张卡片按序号错峰浮现（120ms/张，封顶 720ms）
      style={{ animationDelay: `${Math.min((index - 1) * 120, 720)}ms` }}
    >
      {/* Header */}
      <div className="px-4 py-2 bg-slate-100/70 border-b border-slate-200 flex items-center gap-3">
        {/* 序号 */}
        <div className="w-6 h-6 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
          {index}
        </div>
        {/* 状态点 */}
        <div className={`w-2 h-2 rounded-full ${statusColor} shrink-0`} />
        {/* 工具名 */}
        <span className="text-sm font-semibold text-slate-600 font-mono">
          {tool.name}
        </span>
        {/* 状态文字 */}
        <span
          className={`text-xs ${
            hasResult ? "text-slate-500" : "text-amber-600"
          }`}
        >
          {statusText}
        </span>
        <div className="flex-1" />
        {/* 折叠按钮：永远可点，让用户自由切换 */}
        {needsCollapse && hasResult && (
          <button
            onClick={onToggle}
            className="text-xs text-slate-500 hover:text-slate-700 px-2 py-0.5 rounded hover:bg-slate-200/50"
          >
            {isCollapsed
              ? `展开 (${resultLines.length} 行)`
              : "折叠"}
          </button>
        )}
      </div>

      {/* Args */}
      {Object.keys(tool.args).length > 0 && (
        <div className="px-4 py-2 bg-slate-100/40 border-b border-slate-200/70">
          <div className="text-xs text-slate-400 mb-1">参数</div>
          <div className="text-xs font-mono text-slate-500 space-y-0.5">
            {Object.entries(tool.args).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-slate-400">{k}:</span>
                <span className="text-slate-600 break-all">
                  {typeof v === "string" ? v : JSON.stringify(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result（markdown 渲染） */}
      {hasResult && (
        <div className="px-4 py-3">
          <div className="text-xs text-slate-400 mb-1.5">结果</div>
          <div className="text-xs text-slate-600 leading-relaxed font-mono">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p className="my-1.5 leading-relaxed whitespace-pre-wrap break-words">
                    {children}
                  </p>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-slate-800">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-slate-500">{children}</em>
                ),
                ul: ({ children }) => (
                  <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>
                ),
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                h1: ({ children }) => <h1 className="text-sm font-semibold text-slate-800 mt-2 mb-1">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-semibold text-slate-800 mt-2 mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-xs font-semibold text-slate-700 mt-1.5 mb-1">{children}</h3>,
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">
                    {children}
                  </a>
                ),
                code: ({ children, ...props }: any) => {
                  const isInline = !(props as any).node?.position
                  return isInline ? (
                    <code className="bg-slate-200/70 text-indigo-700 px-1 py-0.5 rounded text-[11px]">
                      {children}
                    </code>
                  ) : (
                    <code className="font-mono">{children}</code>
                  )
                },
                pre: ({ children }) => (
                  <pre className="bg-slate-900 text-slate-100 rounded p-2 overflow-x-auto text-[11px] my-1.5 leading-relaxed">
                    {children}
                  </pre>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-slate-300 pl-2 my-1.5 text-slate-500 italic">
                    {children}
                  </blockquote>
                ),
                hr: () => <hr className="my-2 border-slate-200" />,
              }}
            >
              {isCollapsed && needsCollapse
                ? previewText + `\n... (省略 ${resultLines.length - PREVIEW_LINES} 行)`
                : resultText}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {!hasResult && (
        <div className="px-4 py-3 text-xs text-slate-400 italic">
          等待工具返回...
        </div>
      )}
    </div>
  )
}
