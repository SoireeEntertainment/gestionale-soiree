'use client'

import Link from 'next/link'
import { Work, Client, Category } from '@prisma/client'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'

type WorkWithRelations = Work & { client: Client; category: Category }

type ProfileCalendarProps = {
  works: WorkWithRelations[]
  range: 'today' | '7days' | '30days'
  onRangeChange: (r: 'today' | '7days' | '30days') => void
}

export function ProfileCalendar({ works, range, onRangeChange }: ProfileCalendarProps) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const end7 = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000)
  const end30 = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000)

  const filtered = works.filter((w) => {
    if (!w.deadline) return false
    const d = new Date(w.deadline)
    if (range === 'today') return d >= startOfToday && d <= endOfToday
    if (range === '7days') return d >= startOfToday && d <= end7
    return d >= startOfToday && d <= end30
  })

  const byDay: Record<string, WorkWithRelations[]> = {}

  filtered.forEach((w) => {
    if (!w.deadline) return
    const key = format(new Date(w.deadline), 'yyyy-MM-dd')
    if (!byDay[key]) byDay[key] = []
    byDay[key].push(w)
  })

  const sortedDays = Object.keys(byDay).sort()

  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-6 mb-8" id="calendario">
      <h2 className="text-xl font-semibold text-white mb-4">Calendario personale</h2>

      <div className="flex gap-2 mb-4 flex-wrap">
        {(['today', '7days', '30days'] as const).map((r) => (
          <Button
            key={r}
            variant={range === r ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onRangeChange(r)}
            style={
              range === r
                ? { backgroundColor: 'var(--accent)', color: 'var(--dark)', padding: '6px 12px', borderRadius: '6px', fontSize: '14px' }
                : { backgroundColor: 'transparent', color: 'rgba(255,255,255,0.8)', padding: '6px 12px', borderRadius: '6px', fontSize: '14px' }
            }
          >
            {r === 'today' ? 'Oggi' : r === '7days' ? '7 giorni' : '30 giorni'}
          </Button>
        ))}
      </div>

      <div className="space-y-4">
        {sortedDays.length === 0 ? (
          <p className="text-white/50 py-4">Nessuna scadenza nel periodo selezionato.</p>
        ) : (
          sortedDays.map((dayKey) => {
            const dayWorks = byDay[dayKey]
            const d = new Date(dayKey)
            const isToday =
              d.getDate() === now.getDate() &&
              d.getMonth() === now.getMonth() &&
              d.getFullYear() === now.getFullYear()
            const isOverdue = d < new Date(now.getFullYear(), now.getMonth(), now.getDate()) && !isToday

            return (
              <div key={dayKey} className="border border-white/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-white font-medium">
                    {format(d, 'EEEE d MMMM yyyy', { locale: it })}
                  </span>
                  {isToday && (
                    <span className="px-2 py-0.5 rounded text-xs bg-accent/20 text-accent" style={{ marginLeft: '4px' }}>Oggi</span>
                  )}
                  {isOverdue && (
                    <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400" style={{ marginLeft: '4px' }}>Scaduto</span>
                  )}
                </div>
                <ul className="space-y-2">
                  {dayWorks.map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-2">
                      <Link href={`/works/${w.id}`} className="text-accent hover:underline truncate">
                        {w.title}
                      </Link>
                      <span className="text-white/50 text-sm shrink-0">
                        {w.priority === 'HIGH' && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400 mr-1">
                            Alta
                          </span>
                        )}
                        {w.client.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })
        )}
      </div>

      <Link href="/calendar" className="inline-block mt-4 text-accent hover:underline text-sm">
        Apri calendario completo →
      </Link>
    </div>
  )
}
