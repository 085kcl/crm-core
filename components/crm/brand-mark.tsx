import { Orbit } from "lucide-react"
import { cn } from "@/lib/utils"

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-[#49d3a7] text-[#081524] shadow-[0_10px_28px_rgba(73,211,167,0.25)]">
        <Orbit className="size-5" strokeWidth={2.4} />
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[#0b1529] bg-white" />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block text-[15px] font-bold tracking-[-0.02em]">CRM Core</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] opacity-55">
            Work Edition
          </span>
        </span>
      )}
    </div>
  )
}
