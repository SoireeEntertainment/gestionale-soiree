import { cn } from '@/lib/utils'

interface ProgressBarProps {
  percent: number
  className?: string
  barClassName?: string
  showLabel?: boolean
  size?: 'sm' | 'md'
}

export function ProgressBar({
  percent,
  className,
  barClassName,
  showLabel = false,
  size = 'sm',
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent))
  const height = size === 'sm' ? 'h-1.5' : 'h-2'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex-1 bg-white/10 rounded-full overflow-hidden', height, barClassName)}>
        <div className="h-full bg-accent transition-all duration-300" style={{ width: `${clamped}%` }} />
      </div>
      {showLabel && <span className="text-xs text-white/50 shrink-0">{clamped}%</span>}
    </div>
  )
}
