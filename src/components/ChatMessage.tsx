// 单条消息（用户问题 / AI 回答）
// 配色：user 浅蓝 + 右下小尾巴感；assistant 白底 + 左边框 + 微阴影

import { useEffect, useState } from "react"
import type { FC } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface Props {
  role: "user" | "assistant"
  content: string
  sources?: string[]
  isTyping?: boolean
}

export const ChatMessage: FC<Props> = ({ role, content, sources, isTyping }) => {
  const isUser = role === "user"
  const [mounted, setMounted] = useState(false)

  // 入场动画（用 transition 模拟 animate-in）
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 10)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} transition-all duration-300 ease-out ${
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <div
        className={
          isUser
            ? "max-w-[80%] bg-indigo-50 border-r-4 border-indigo-400 rounded-lg rounded-tr-sm px-4 py-3 shadow-sm"
            : "max-w-[720px] bg-white border-l-4 border-emerald-500 rounded-lg rounded-tl-sm px-4 py-3 shadow-sm"
        }
      >
        {/* 角色标头 */}
        <div className="flex items-center gap-2 mb-2 text-xs">
          {isUser ? (
            <>
              <div className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold">
                你
              </div>
              <span className="text-slate-600">你</span>
            </>
          ) : (
            <>
              <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">
                AI
              </div>
              <span className="text-slate-600 font-medium">
                SecOps Copilot
              </span>
              <span className="text-slate-400">· 安全研判助手</span>
            </>
          )}
        </div>

        {/* 正文（Markdown 渲染） */}
        <div
          className={
            isUser
              ? "text-sm text-slate-800 leading-relaxed"
              : "text-sm text-slate-800 leading-relaxed"
          }
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{content}</div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-lg font-semibold text-slate-900 mt-3 mb-2">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-base font-semibold text-slate-900 mt-3 mb-2">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-semibold text-slate-800 mt-2 mb-1">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="my-1.5 text-sm leading-relaxed text-slate-800">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="my-1.5 ml-4 list-disc text-sm text-slate-800 space-y-0.5">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-1.5 ml-4 list-decimal text-sm text-slate-800 space-y-0.5">
                    {children}
                  </ol>
                ),
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => (
                  <strong className="font-semibold text-slate-900">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-slate-700">{children}</em>
                ),
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 underline hover:text-indigo-800"
                  >
                    {children}
                  </a>
                ),
                pre: ({ children }) => (
                  <pre className="bg-slate-900 text-slate-100 rounded p-3 overflow-x-auto text-xs my-2 leading-relaxed">
                    {children}
                  </pre>
                ),
                code: ({ children, ...props }: any) => {
                  // 行内 code（不在 pre 内）
                  const isInline = !(props as any).node?.position
                  return isInline ? (
                    <code className="bg-slate-100 text-indigo-600 px-1 py-0.5 rounded text-[12px] font-mono">
                      {children}
                    </code>
                  ) : (
                    <code className="font-mono">{children}</code>
                  )
                },
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-slate-300 pl-3 my-2 text-slate-600 italic">
                    {children}
                  </blockquote>
                ),
                hr: () => <hr className="my-3 border-slate-200" />,
                table: ({ children }) => (
                  <div className="my-2 overflow-x-auto">
                    <table className="text-xs border-collapse w-full">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-slate-200 px-2 py-1 bg-slate-50 text-left font-semibold text-slate-700">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-slate-200 px-2 py-1 text-slate-700">
                    {children}
                  </td>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          )}
          {/* 打字机光标 */}
          {isTyping && (
            <span
              className="inline-block w-1.5 h-4 bg-emerald-500 ml-0.5 align-middle"
              style={{
                animation: "blink 0.8s steps(2) infinite",
              }}
            />
          )}
        </div>

        {/* 引用源 */}
        {sources && sources.length > 0 && (
          <div className="mt-3 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span className="text-slate-400">📎 引用：</span>
            {sources.map((s, i) => (
              <span
                key={i}
                className="ml-1 inline-block text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
