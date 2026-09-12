import type { ReactNode } from "react"

export function PageHeading({
  title,
  desc,
  children,
}: {
  title: string
  desc?: string
  children?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  )
}
