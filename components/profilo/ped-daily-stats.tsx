'use client'

import { PED_LABELS, PED_LABEL_CONFIG, type PedLabel } from '@/lib/pedLabels'
import type { PedDailyStats as PedDailyStatsType } from '@/app/actions/profilo'

type PedDailyStatsProps = {
  stats: PedDailyStatsType
}

export function PedDailyStats({ stats }: PedDailyStatsProps) {
  const { total, remaining, done, byLabel } = stats

  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-6 mb-8" id="statistiche-ped-giornaliere">
      <h2 className="text-xl font-semibold text-white mb-4">Statistiche task giornaliere (PED)</h2>
      {total === 0 ? (
        <p className="text-white/60">Nessuna task per oggi.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="rounded-lg p-4 bg-white/5 border border-white/10">
              <div className="text-2xl font-bold text-white">{remaining}</div>
              <div className="text-sm text-white/70">Rimanenti</div>
            </div>
            <div className="rounded-lg p-4 bg-white/5 border border-white/10">
              <div className="text-2xl font-bold text-emerald-400">{done}</div>
              <div className="text-sm text-white/70">Fatte</div>
            </div>
            <div className="rounded-lg p-4 bg-white/5 border border-white/10 sm:col-span-2">
              <div className="text-2xl font-bold text-accent">{total}</div>
              <div className="text-sm text-white/70">Totale task oggi</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {PED_LABELS.map((key) => {
              const config = PED_LABEL_CONFIG[key]
              const count = byLabel[key] ?? 0
              return (
                <span
                  key={key}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${config.bg} ${config.text}`}
                  style={{ backgroundColor: config.backgroundColor, color: config.color }}
                >
                  {config.label}: {count}
                </span>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
