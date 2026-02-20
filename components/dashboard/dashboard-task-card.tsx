'use client'

import { PED_ITEM_TYPE_LABELS } from '@/lib/ped-utils'
import type { DashboardTaskStats } from '@/lib/dashboard-types'

const NEUTRAL_COLORS = [
  'bg-slate-500',
  'bg-slate-400',
  'bg-slate-600',
  'bg-white/40',
  'bg-white/30',
  'bg-white/50',
  'bg-slate-400/80',
  'bg-slate-500/80',
  'bg-white/35',
  'bg-slate-600/80',
  'bg-slate-700',
]

export function DashboardTaskCard({ stats }: { stats: DashboardTaskStats }) {
  const { total, byType, periodLabel } = stats
  const entries = Object.entries(byType)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
  const maxCount = Math.max(...entries.map(([, c]) => c), 1)

  return (
    <div className="bg-dark border border-accent/20 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-1 text-white">Task</h2>
      <p className="text-white/50 text-sm mb-4">PED · {periodLabel}</p>
      <div className="flex items-baseline gap-2 mb-6">
        <span className="text-4xl font-bold text-white">{total}</span>
        <span className="text-white/60 text-sm">task nel periodo</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-white/50 text-sm">Nessuna task in questo periodo.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium text-white/60 uppercase tracking-wide">Per tipologia</p>
          <div className="space-y-2">
            {entries.map(([type, count], i) => (
              <div key={type} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-sm text-white/90">
                  {PED_ITEM_TYPE_LABELS[type] ?? type}
                </div>
                <div className="flex-1 h-6 rounded bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded ${NEUTRAL_COLORS[i % NEUTRAL_COLORS.length]}`}
                    style={{ width: `${(count / maxCount) * 100}%`, minWidth: count > 0 ? '4px' : 0 }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-medium text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
