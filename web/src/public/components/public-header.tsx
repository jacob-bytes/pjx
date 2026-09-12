import { Gear, Moon, Sun } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { getPaused, getUpdatedAt, setPaused, usePublicTick } from "@/public/mock"
import { BrandMark } from "@/public/components/site-footer"
import { useTheme } from "@/lib/theme"

export function PublicHeader() {
  usePublicTick()
  const { dark, setDark } = useTheme()
  const paused = getPaused()
  const updated = new Date(getUpdatedAt()).toLocaleTimeString("zh-CN", {
    hour12: false,
  })

  return (
    <header className="sticky top-0 z-30 border-b bg-background">
      <div className="mx-auto flex h-12 w-full max-w-[1280px] items-center gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <BrandMark size="md" />
          {/*
            品牌 lockup：主名 + 细分隔线 + 副标题。
            原来主名和副标题是两个平行 span，只靠 gap 分隔，主次关系靠字号差一点点，
            看着是"两个词并排"而不是一个标识。
          */}
          <h1 className="flex items-center gap-2 text-lg leading-none font-semibold tracking-tight">
            <span>pjx</span>
            <span className="h-3 w-px bg-border" aria-hidden />
            <span className="text-xs font-normal tracking-normal text-subtle">
              服务状态
            </span>
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            className="flex h-8 shrink-0 touch:h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-2 touch:px-3 text-2xs text-muted-foreground transition-colors dur-2 hover:bg-muted hover:text-foreground"
            aria-label="切换实时更新"
          >
            <span
              className={
                paused
                  ? "size-[6px] rounded-full bg-subtle"
                  : "size-[6px] rounded-full bg-ok"
              }
            />
            {paused ? "已暂停" : "实时 · 1s"}
            {/* 具体时刻窄屏隐藏：只留「实时 · 1s」的点，时刻在页脚和详情里都有 */}
              <span className="num hidden text-subtle sm:inline">{updated}</span>
          </button>


          <Button
            variant="ghost"
            size="icon"
            className="size-8 touch:size-11 text-muted-foreground"
            onClick={() => setDark(!dark)}
            aria-label="切换主题"
          >
            {dark ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>

          <Button
              asChild
              variant="outline"
              size="sm"
              /* touch:h-11 —— 触屏下 32px 太小，管理入口是主要导航 */
              className="h-8 touch:h-11 gap-1.5 px-2.5 text-xs"
            >
            <a href="/admin/">
              <Gear className="size-3.5" />
              管理
            </a>
          </Button>
        </div>
      </div>
    </header>
  )
}
