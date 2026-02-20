'use client'

import { useState } from 'react'
import type { TeamLoadUserRow, LoadSnapshot, TeamLoadCapacity } from '@/app/actions/profilo'

const TASK_COLOR = 'rgba(16, 249, 199, 0.9)' // accent
const WORK_COLOR = 'rgba(245, 158, 11, 0.85)' // amber

type Period = 'daily' | 'weekly' | 'monthly'

const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Giornaliero',
  weekly: 'Settimanale',
  monthly: 'Mensile',
}

function CapacityBlock({ capacity }: { capacity: TeamLoadCapacity }) {
  const { current, max, saturationPct, isOverloaded } = capacity
  return (
    <div className="mt-3 w-full px-1">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-white/60">Capacità</span>
        <span className="text-xs font-medium text-white">
          {current} / {max}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${
            isOverloaded ? 'bg-amber-500' : saturationPct > 70 ? 'bg-amber-500/80' : 'bg-accent/70'
          }`}
          style={{ width: `${Math.min(saturationPct, 100)}%` }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-white/50">{saturationPct}%</span>
        {isOverloaded && (
          <span className="text-[10px] font-medium text-amber-400">Sovraccarico</span>
        )}
      </div>
    </div>
  )
}

function PieChartTaskWork({ snapshot, size = 100 }: { snapshot: LoadSnapshot; size?: number }) {
  const { taskCount, workCount, total } = snapshot
  const strokeWidth = Math.max(12, size * 0.2)
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const taskDash = total > 0 ? (taskCount / total) * circumference : 0
  const workDash = total > 0 ? (workCount / total) * circumference : circumference

  if (total === 0) {
    return (
      <div className="rounded-full bg-white/10 flex items-center justify-center text-white/50 text-xs" style={{ width: size, height: size }}>
        0
      </div>
    )
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={WORK_COLOR}
          strokeWidth={strokeWidth}
          strokeDasharray={`${workDash} ${circumference}`}
          strokeDashoffset={0}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={TASK_COLOR}
          strokeWidth={strokeWidth}
          strokeDasharray={`${taskDash} ${circumference}`}
          strokeDashoffset={-workDash}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-sm font-bold text-white">{total}</span>
      </div>
    </div>
  )
}

type DashboardTeamLoadOverviewProps = {
  rows: TeamLoadUserRow[]
}

export function DashboardTeamLoadOverview({ rows }: DashboardTeamLoadOverviewProps) {
  const [period, setPeriod] = useState<Period>('weekly')

  if (rows.length === 0) return null

  return (
    <div
      className="bg-dark border border-accent/20 rounded-lg p-6 lg:col-span-2"
      style={{ backgroundColor: 'var(--dark)', border: '1px solid rgba(16, 249, 199, 0.2)', borderRadius: '0.5rem', gridColumn: '1 / -1' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className="text-xl font-semibold text-white" style={{ fontSize: '1.25rem', fontWeight: 600 }}>
          Overview carico team
        </h2>
        <div className="flex gap-2">
          {(['daily', 'weekly', 'monthly'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-accent/30 text-white border border-accent/50'
                  : 'bg-white/10 text-white/70 hover:bg-white/15 border border-transparent'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {rows.map((row) => {
          const snapshot = row[period]
          const cap = row.capacity
          return (
            <div
              key={row.userId}
              className="rounded-lg border border-white/10 bg-white/5 p-4 flex flex-col items-center"
            >
              <div className="font-medium text-white mb-3 text-center">{row.userName}</div>
              <PieChartTaskWork snapshot={snapshot} size={100} />
              <div className="flex gap-4 mt-2 text-xs text-white/70">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TASK_COLOR }} />
                  Task {snapshot.taskCount}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: WORK_COLOR }} />
                  Lavori {snapshot.workCount}
                </span>
              </div>
              <CapacityBlock capacity={cap} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
