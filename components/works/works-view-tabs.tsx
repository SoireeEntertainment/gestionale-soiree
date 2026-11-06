'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

export type WorksView = 'active' | 'archive'

export function WorksViewTabs({
  view,
  activeCount,
  archiveCount,
  basePath = '/works',
}: {
  view: WorksView
  activeCount: number
  archiveCount: number
  basePath?: string
}) {
  const searchParams = useSearchParams()

  const hrefFor = (next: WorksView) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'archive') {
      params.set('view', 'archive')
      if (params.get('status') === 'DONE') params.delete('status')
    } else {
      params.delete('view')
      if (params.get('status') === 'DONE') params.delete('status')
    }
    const qs = params.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  return (
    <nav
      className="mb-4 inline-flex rounded-xl border border-accent/15 bg-white/[0.03] p-1"
      aria-label="Vista lavori"
    >
      <Link
        href={hrefFor('active')}
        className={cn(
          'rounded-lg px-3.5 py-2 text-sm font-medium transition-colors min-h-[40px] inline-flex items-center',
          view === 'active'
            ? 'bg-accent/20 text-accent'
            : 'text-white/55 hover:text-white/80'
        )}
        aria-current={view === 'active' ? 'page' : undefined}
      >
        Lavori attivi
        <span className="ml-1.5 tabular-nums text-xs opacity-80">({activeCount})</span>
      </Link>
      <Link
        href={hrefFor('archive')}
        className={cn(
          'rounded-lg px-3.5 py-2 text-sm font-medium transition-colors min-h-[40px] inline-flex items-center',
          view === 'archive'
            ? 'bg-accent/20 text-accent'
            : 'text-white/55 hover:text-white/80'
        )}
        aria-current={view === 'archive' ? 'page' : undefined}
      >
        Archivio
        <span className="ml-1.5 tabular-nums text-xs opacity-80">({archiveCount})</span>
      </Link>
    </nav>
  )
}
