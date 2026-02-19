'use client'

import { PED_LABELS, PED_LABEL_CONFIG, type PedLabel } from '@/lib/pedLabels'

type ByLabel = Record<PedLabel, number>

type DashboardPedTodayProps = {
  byLabel: ByLabel
}

function getTotal(byLabel: ByLabel): number {
  return PED_LABELS.reduce((sum, key) => sum + (byLabel[key] ?? 0), 0)
}

export function DashboardPedToday({ byLabel }: DashboardPedTodayProps) {
  const total = getTotal(byLabel)
  const size = 180
  const strokeWidth = 28
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r

  const segments = PED_LABELS.map((key) => ({
    key,
    config: PED_LABEL_CONFIG[key],
    count: byLabel[key] ?? 0,
  })).filter((s) => s.count > 0)

  let offset = 0
  const slices = segments.map((seg) => {
    const dash = total > 0 ? (seg.count / total) * circumference : 0
    const slice = { ...seg, dash, offset }
    offset += dash
    return slice
  })

  return (
    <div className="bg-dark border border-accent/20 rounded-lg p-6" style={{ backgroundColor: 'var(--dark)', border: '1px solid rgba(16, 249, 199, 0.2)', borderRadius: '0.5rem' }}>
      <h2 className="text-xl font-semibold mb-4 text-white" style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
        Task di oggi (PED)
      </h2>
      {total === 0 ? (
        <p className="text-white/50">Nessuna task per oggi.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="rotate-[-90deg]">
              {slices.map((slice) => (
                <circle
                  key={slice.key}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={slice.config.backgroundColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${slice.dash} ${circumference}`}
                  strokeDashoffset={-slice.offset}
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-white">{total}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 min-w-[200px]">
            {PED_LABELS.map((key) => {
              const config = PED_LABEL_CONFIG[key]
              const count = byLabel[key] ?? 0
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: config.backgroundColor }}
                    />
                    <span className="text-white/90">{config.label}</span>
                  </span>
                  <span className="text-white font-medium">
                    {count} {pct > 0 && `(${pct}%)`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
