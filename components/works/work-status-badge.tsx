import { getWorkStatusMeta } from '@/lib/work-status'

export function WorkStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = getWorkStatusMeta(status)
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${meta.badgeClassName} ${className ?? ''}`.trim()}
    >
      {meta.label}
    </span>
  )
}
