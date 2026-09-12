import { CheckCircle, Info, SpinnerGap, Warning, WarningOctagon } from "@phosphor-icons/react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/lib/theme"

const Toaster = ({ ...props }: ToasterProps) => {
  // 跟随应用内主题开关（@/lib/theme），不是 next-themes 的 system 偏好。
  const { dark } = useTheme()

  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      className="toaster group"
      icons={{
        success: <CheckCircle className="size-4" />,
        info: <Info className="size-4" />,
        warning: <Warning className="size-4" />,
        error: <WarningOctagon className="size-4" />,
        loading: <SpinnerGap className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
