'use client'

import { format } from 'date-fns'
import { it } from 'date-fns/locale'

type HistoryEntry = {
  id: string
  previousDeadline: Date | string | null
  newDeadline: Date | string | null
  changedAt: Date | string
  isOriginal: boolean
  note?: string | null
  changedBy: { id: string; name: string }
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return format(date, 'd MMMM yyyy', { locale: it })
}

function formatDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return format(date, "d MMM yyyy 'alle' HH:mm", { locale: it })
}

export function WorkDueDateHistory({
  originalDeadline,
  history,
}: {
  originalDeadline?: Date | string | null
  history: HistoryEntry[]
}) {
  const hasOriginal = !!originalDeadline || history.some((entry) => entry.isOriginal)
  if (!hasOriginal && history.length === 0) {
    return (
      <section className="rounded-xl border border-accent/20 bg-dark p-4 md:p-5">
        <h2 className="text-lg font-semibold text-white mb-2">Storico consegne</h2>
        <p className="text-sm text-white/50">Nessuna data di consegna registrata per questo lavoro.</p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-accent/20 bg-dark p-4 md:p-5">
      <h2 className="text-lg font-semibold text-white mb-1">Storico consegne</h2>
      <p className="text-sm text-white/50 mb-4">
        Data originale e successive riprogrammazioni della consegna.
      </p>

      {originalDeadline && (
        <div className="mb-4 rounded-lg border border-accent/15 bg-white/[0.03] px-3 py-2.5">
          <div className="text-xs uppercase tracking-wide text-white/40 mb-1">Data di consegna originale</div>
          <div className="text-sm font-medium text-white">{formatDate(originalDeadline)}</div>
        </div>
      )}

      <ol className="space-y-3">
        {history.map((entry) => (
          <li
            key={entry.id}
            className="rounded-lg border border-white/10 bg-[#14171c] px-3 py-3"
          >
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              {entry.isOriginal ? (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                  Originale
                </span>
              ) : (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/70">
                  Riprogrammazione
                </span>
              )}
              <span className="text-xs text-white/40">{formatDateTime(entry.changedAt)}</span>
            </div>
            <p className="text-sm text-white">
              {entry.isOriginal ? (
                <>
                  Impostata a <span className="font-medium">{formatDate(entry.newDeadline)}</span>
                </>
              ) : (
                <>
                  Da <span className="font-medium">{formatDate(entry.previousDeadline)}</span>
                  {' → '}
                  <span className="font-medium">{formatDate(entry.newDeadline)}</span>
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-white/50">di {entry.changedBy.name}</p>
            {entry.note ? <p className="mt-1 text-xs text-white/40 italic">{entry.note}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}
