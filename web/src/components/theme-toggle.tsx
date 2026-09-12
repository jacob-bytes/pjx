import { Moon, Sun } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/lib/theme"

export function ThemeToggle() {
  const { dark, setDark } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground"
      onClick={() => setDark(!dark)}
      aria-label={dark ? "切换到浅色" : "切换到深色"}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
