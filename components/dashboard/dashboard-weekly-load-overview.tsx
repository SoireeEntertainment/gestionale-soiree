'use client'

import type { WeeklyLoadUserRow } from '@/app/actions/profilo'

type DashboardWeeklyLoadOverviewProps = {
  rows: WeeklyLoadUserRow[]
}

export function DashboardWeeklyLoadOverview({ rows }: DashboardWeeklyLoadOverviewProps) {
  if (rows.length === 0) return null

  const maxTotal = Math.max(...rows.map((r) => r.total), 1)

  return (
    <div className="bg-dark border border-accent/20 rounded-lg p-6 lg:col-span-2" style={{ backgroundColor: 'var(--dark)', border: '1px solid rgba(16, 249, 199, 0.2)', borderRadius: '0.5rem', gridColumn: '1 / -1' }}>
      <h2 className="text-xl font-semibold mb-4 text-white" style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
        Overview carico settimanale team
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-white/70">
              <th className="pb-2 pr-4 font-medium">Utente</th>
              <th className="pb-2 pr-4 font-medium text-right">Totale</th>
              <th className="pb-2 pr-4 font-medium text-right">Task</th>
              <th className="pb-2 pr-4 font-medium text-right">Lavori</th>
              <th className="pb-2 font-medium w-32">Barra</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.userId} className="text-white/90">
                <td className="py-2 pr-4 font-medium">{row.userName}</td>
                <td className="py-2 pr-4 text-right">{row.total}</td>
                <td className="py-2 pr-4 text-right">{row.taskCount}</td>
                <td className="py-2 pr-4 text-right">{row.workCount}</td>
                <td className="py-2 w-32">
                  <div className="h-2 rounded-full overflow-hidden bg-white/10">
                    <div
                      className="h-full rounded-full bg-accent/80 transition-all"
                      style={{
                        width: `${maxTotal > 0 ? (row.total / maxTotal) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
