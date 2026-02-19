'use client'

type WeeklyLoadProps = {
  total: number
  byStatus: Record<string, number>
  /** Se fornito, mostra "X carico settimanale di cui Y task e Z lavori" (settimana ISO). */
  weeklyLoadSummary?: { total: number; taskCount: number; workCount: number }
}

const statusLabels: Record<string, string> = {
  TODO: 'Da fare',
  IN_PROGRESS: 'In corso',
  IN_REVIEW: 'In revisione',
  WAITING_CLIENT: 'Attesa cliente',
  PAUSED: 'In pausa',
}

export function WeeklyLoad({ total, byStatus, weeklyLoadSummary }: WeeklyLoadProps) {
  const summary = weeklyLoadSummary ?? { total, taskCount: 0, workCount: total }
  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-semibold text-white mb-4">Carico settimanale</h2>
      <div className="text-3xl font-bold text-white mb-2">{summary.total}</div>
      <p className="text-white/60 text-sm mb-4">
        {summary.taskCount} task e {summary.workCount} lavori (settimana corrente)
      </p>
      {Object.keys(byStatus).length > 0 && (
        <div className="space-y-2 mt-4 pt-4 border-t border-white/10">
          <p className="text-white/50 text-xs mb-2">Lavori per stato</p>
          {Object.entries(byStatus).map(([status, count]) => (
            <div key={status} className="flex justify-between text-sm">
              <span className="text-white/70">{statusLabels[status] ?? status}</span>
              <span className="text-white font-medium">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
