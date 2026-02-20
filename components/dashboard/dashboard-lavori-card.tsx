'use client'

import type { DashboardWorkStats } from '@/lib/dashboard-types'

const CATEGORY_WARNING_PCT = 90

export function DashboardLavoriCard({ stats }: { stats: DashboardWorkStats }) {
  const { total, byCategory, capacity } = stats
  const { max, saturationPct, isOverloaded } = capacity
  const maxCat = Math.max(...byCategory.map((c) => c.count), 1)

  return (
    <div className="bg-dark border border-accent/20 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-1 text-white">Lavori</h2>
      <p className="text-white/50 text-sm mb-4">Assegnati a te (attivi)</p>

      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-4xl font-bold text-white">{total}</span>
        <span className="text-white/60 text-sm">lavori</span>
      </div>

      {/* Capacità */}
      <div className="mb-6 p-3 rounded-lg bg-white/5 border border-white/10">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-white/80">Capacità</span>
          <span className="text-sm font-medium text-white">
            {total} / {max} lavori
          </span>
        </div>
        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isOverloaded ? 'bg-amber-500' : saturationPct > 70 ? 'bg-amber-500/80' : 'bg-accent/70'
            }`}
            style={{ width: `${Math.min(saturationPct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-white/50">{saturationPct}% capacità</span>
          {isOverloaded && (
            <span className="text-xs font-medium text-amber-400">Sovraccarico</span>
          )}
        </div>
      </div>

      {/* Breakdown per categoria */}
      {byCategory.length === 0 ? (
        <p className="text-white/50 text-sm">Nessun lavoro assegnato.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium text-white/60 uppercase tracking-wide">Per categoria</p>
          <div className="space-y-2">
            {byCategory.map(({ categoryName, count }) => {
              const pct = max > 0 ? (count / max) * 100 : 0
              const categoryOverloaded = pct >= CATEGORY_WARNING_PCT
              return (
                <div key={categoryName} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 flex items-center gap-1.5">
                    <span className="text-sm text-white/90 truncate">{categoryName}</span>
                    {categoryOverloaded && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-300">
                        Sovraccarico
                      </span>
                    )}
                  </div>
                  <div className="flex-1 h-5 rounded bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded ${
                        categoryOverloaded ? 'bg-amber-500/80' : 'bg-white/30'
                      }`}
                      style={{
                        width: `${(count / maxCat) * 100}%`,
                        minWidth: count > 0 ? '4px' : 0,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm font-medium text-white">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
