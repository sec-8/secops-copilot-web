// 下拉切用户组件
// 未做用户管理，所以固定用户：guest / 小胖 / 小明 / 长安
import { useState, useRef, useEffect } from "react"
import type { FC } from "react"

interface Props {
  userId: string
  onChange: (id: string) => void
  onSwitch?: () => void  // 切换时额外回调（清 useChatStream 状态）
}
const FIXED_USERS = [
    {
        user_id: "use_1",
        user_name: "小胖", 
    },
    {
        user_id: "use_2",
        user_name: "小明", 
    },
    {
        user_id: "use_3",
        user_name: "长安", 
    }
]

export const UserSwitcher: FC<Props> = ({ userId, onChange, onSwitch }) => {
    const [open, setOpen] = useState(false)
    const switcherRef = useRef<HTMLDivElement>(null)

    // 点外面关掉
    useEffect(() => {
        const onClickOutside = (e: MouseEvent) => {
            if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", onClickOutside)
        return () => document.removeEventListener("mousedown", onClickOutside)
    }, [])

    const switchTo = (id: string) => {
        if (id === userId) {  // 切当前 user → 禁用，不清状态不重拉
            setOpen(false)
            return
        }
        localStorage.setItem("secops_user_id", id)  // localStorage：跨页签共享，关页签不丢
        onChange(id) // 触发 useChatHistory 重拉
        onSwitch?.() // 额外回调：清 useChatStream 状态
        setOpen(false)
    }
    // 显示名：guest_xxx 截断
    const showName = userId.startsWith("guest_") 
        ? `guest · ${userId.slice(-4)}` 
        : FIXED_USERS.find((f) => f.user_id === userId)?.user_name || "unknown"

    return (
        <div className="relative" ref={switcherRef}>
            <button
                onClick={() => setOpen(!open)}
                className="text-xs text-slate-600 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 flex items-center gap-1"
            >
                <span>👤</span>
                <span>{showName}</span>
                <span>▼</span>
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[140px]">
                    {FIXED_USERS.map((item) => (
                        <button
                        key={item.user_id}
                        onClick={() => switchTo(item.user_id)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 ${
                            item.user_id === userId ? "bg-indigo-50 text-indigo-700" : "text-slate-700"
                        }`}
                        >
                            {item.user_name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}