// 打字机 Hook
// 返回 [displayed, done]：displayed 是当前已显示的字串，done 表示已追到 target
//
// 1. timer 只依赖 speedMs（不在 text 变化时重置），让 interval 持续追不被 token 打断
// 2. 单独的 useEffect 同步 textRef（text 变化时更新 target，但不重置 timer）
// 3. 用 doneRef 替代 done state 进 deps（避免 done 变触发 timer 重置）
import { useEffect, useState, useRef } from "react"

export function useTypewriter(text: string, speedMs: number = 30): [string, boolean] {
  const [displayed, setDisplayed] = useState("")
  const [done, setDone] = useState(false)
  const displayedRef = useRef("")       // 同步镜像
  const textRef = useRef("")             // 跟踪目标
  const indexRef = useRef(0)             // 当前显示到第几字
  const doneRef = useRef(false)          // 同步镜像（不进 deps）

  // text 变化时更新 textRef + 必要时重置
  useEffect(() => {
    if (!text.startsWith(displayedRef.current) || text.length < displayedRef.current.length) {
      indexRef.current = 0
      displayedRef.current = ""
      setDisplayed("")
      doneRef.current = false
      setDone(false)
    }
    textRef.current = text
  }, [text])

  useEffect(() => {
    const timer = setInterval(() => {
      const target = textRef.current
      const shown = displayedRef.current

      // 已打完 target（仅在 target 非空时标 done，避免初始空 text 误触发）
      if (indexRef.current >= target.length) {
        if (!doneRef.current && target.length > 0) {
          displayedRef.current = target
          setDisplayed(target)
          doneRef.current = true
          setDone(true)
        }
        return
      }

      // target 变了 / 缩短了 → 重置
      if (!target.startsWith(shown)) {
        indexRef.current = 0
        displayedRef.current = ""
        setDisplayed("")
        doneRef.current = false
        setDone(false)
        return
      }

      // target 扩展 / 持续 → 继续打字
      const nextIndex = indexRef.current + 1
      const next = target.slice(0, nextIndex)
      indexRef.current = nextIndex
      displayedRef.current = next
      setDisplayed(next)

      // 这一步追完 → 标 done
      if (nextIndex >= target.length) {
        if (!doneRef.current) {
          doneRef.current = true
          setDone(true)
        }
      }
    }, speedMs)

    return () => clearInterval(timer)
  }, [speedMs])

  return [displayed, done]
}