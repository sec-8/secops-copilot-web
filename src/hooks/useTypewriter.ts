// 打字机效果 hook
// 100ms/字（按你定的速度）
// 不可跳过（不挂 onClick）
// 关键设计：当 text 变化时（新一次回答），重置显示长度
//   - 同长度追加 → 继续打字
//   - 文本变短 → 重置到 0
//   - 文本变长且从 0 开始 → 重置到 0

import { useEffect, useState } from "react"

export function useTypewriter(text: string, speedMs: number = 100): string {
  const [displayed, setDisplayed] = useState("")

  useEffect(() => {
    // 空文本直接清空
    if (!text) {
      setDisplayed("")
      return
    }

    // 已显示完，直接同步
    if (displayed.length >= text.length) {
      setDisplayed(text)
      return
    }

    // 还没显示完，从当前位置继续打字
    const timer = setInterval(() => {
      setDisplayed((prev) => {
        const next = prev.length + 1
        if (next >= text.length) {
          clearInterval(timer)
          return text
        }
        return text.slice(0, next)
      })
    }, speedMs)

    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speedMs])

  return displayed
}
