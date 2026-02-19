'use client'

const MONTH_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

type Stats = {
  dailyStats: Record<string, { total: number; done: number; remainingPct: number; remainingCount?: number }>
  weeklyStats: { weekStart: string; weekEnd: string; total: number; done: number }[]
  monthlyStats: { total: number; done: number }
}

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const [ys, ms, ds] = weekStart.split('-').map(Number)
  const [ye, me, de] = weekEnd.split('-').map(Number)
  const sameMonth = ms === me && ys === ye
  const startLabel = `${ds} ${MONTH_SHORT[ms - 1]} ${ys}`
  const endLabel = sameMonth ? `${de}` : `${de} ${MONTH_SHORT[me - 1]} ${ye}`
  return sameMonth ? `${ds}–${endLabel} ${MONTH_SHORT[ms - 1]} ${ys}` : `${startLabel} – ${endLabel}`
}

function PieChart({
  done,
  total,
  size = 140,
  strokeWidth = 14,
  doneColor = 'rgb(5, 150, 105)',
  remainingColor = 'rgba(245, 158, 11, 0.85)',
  label = '',
}: {
  done: number
  total: number
  size?: number
  strokeWidth?: number
  doneColor?: string
  remainingColor?: string
  label?: string
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const remainingPct = 100 - pct
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const dashDone = total > 0 ? (done / total) * circumference : 0
  const dashRem = circumference - dashDone

  return (
    <div className="flex flex-col items-center">
      {label && <span className="text-xs text-white/70 mb-1">{label}</span>}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={remainingColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dashRem} ${circumference}`}
            strokeDashoffset={0}
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={doneColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dashDone} ${circumference}`}
            strokeDashoffset={-dashRem}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-lg font-bold text-white leading-tight">{pct}%</span>
          <span className="text-[10px] text-white/70">fatto</span>
        </div>
      </div>
      <div className="flex gap-3 mt-2 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: doneColor }} />
          Fatto {pct}%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: remainingColor }} />
          Rimanenti {remainingPct}%
        </span>
      </div>
    </div>
  )
}

function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`
}

export function PedStats({
  stats,
  selectedDateKey,
  year,
  month,
}: {
  stats: Stats
  selectedDateKey: string | null
  year: number
  month: number
}) {
  const dayStat = selectedDateKey ? stats.dailyStats[selectedDateKey] : null
  const currentWeek = selectedDateKey
    ? stats.weeklyStats.find((w) => selectedDateKey >= w.weekStart && selectedDateKey <= w.weekEnd)
    : null
  const weekToShow = currentWeek ?? stats.weeklyStats[0]
  const weekRangeLabel = weekToShow ? formatWeekRange(weekToShow.weekStart, weekToShow.weekEnd) : ''

  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-4">
      <h2 className="text-lg font-semibold text-white mb-4">Statistiche</h2>

      {/* Riferimento settimana */}
      {weekToShow && (
        <p className="text-sm text-accent/90 font-medium mb-4">
          Settimana visualizzata: <span className="text-white">{weekRangeLabel}</span>
        </p>
      )}

      {/* Grafici a torta: giorno selezionato, settimana, mese */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {dayStat && (
          <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
            <PieChart
              done={dayStat.done}
              total={dayStat.total || 1}
              label={`Giorno ${formatDayLabel(selectedDateKey!)}`}
            />
            <p className="text-xs text-white/60 mt-2">
              {dayStat.done}/{dayStat.total} lavori nel giorno
            </p>
          </div>
        )}
        {weekToShow && (
          <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
            <PieChart
              done={weekToShow.done}
              total={weekToShow.total || 1}
              label={`Settimana ${weekRangeLabel}`}
            />
            <p className="text-xs text-white/60 mt-2">
              {weekToShow.done}/{weekToShow.total} lavori nella settimana
            </p>
          </div>
        )}
        <div className="flex flex-col items-center p-3 rounded-lg bg-white/5">
          <PieChart
            done={stats.monthlyStats.done}
            total={stats.monthlyStats.total || 1}
            label="Mese"
          />
          <p className="text-xs text-white/60 mt-2">
            {stats.monthlyStats.done}/{stats.monthlyStats.total} lavori nel mese
          </p>
        </div>
      </div>
    </div>
  )
}
