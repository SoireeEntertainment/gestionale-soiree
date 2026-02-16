'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Work, Client, Category } from '@prisma/client'
import { format, startOfDay, isSameDay, isPast } from 'date-fns'
import { it } from 'date-fns/locale'

interface CalendarViewProps {
  works: (Work & { client: Client; category: Category })[]
  initialRange?: string
}

const statusLabels: Record<string, string> = {
  TODO: 'Da Fare',
  IN_PROGRESS: 'In Corso',
  IN_REVIEW: 'In Revisione',
  WAITING_CLIENT: 'Attesa Cliente',
  DONE: 'Completato',
  PAUSED: 'In Pausa',
  CANCELED: 'Annullato',
}

export function CalendarView({ works, initialRange }: CalendarViewProps) {
  const router = useRouter()
  const [range, setRange] = useState(initialRange || '30days')

  const handleRangeChange = (newRange: string) => {
    setRange(newRange)
    router.push(`/calendar?range=${newRange}`)
  }

  // Group works by day
  const worksByDay = works.reduce((acc, work) => {
    if (!work.deadline) return acc
    const day = format(startOfDay(new Date(work.deadline)), 'yyyy-MM-dd')
    if (!acc[day]) acc[day] = []
    acc[day].push(work)
    return acc
  }, {} as Record<string, typeof works>)

  const sortedDays = Object.keys(worksByDay).sort()

  return (
    <div>
      {/* Range Filter */}
      <div className="bg-dark border border-accent/20 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleRangeChange('today')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              range === 'today'
                ? 'bg-accent text-dark'
                : 'bg-dark border border-accent/20 text-white hover:bg-accent/10'
            }`}
          >
            Oggi
          </button>
          <button
            onClick={() => handleRangeChange('7days')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              range === '7days'
                ? 'bg-accent text-dark'
                : 'bg-dark border border-accent/20 text-white hover:bg-accent/10'
            }`}
          >
            Prossimi 7 giorni
          </button>
          <button
            onClick={() => handleRangeChange('30days')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              range === '30days'
                ? 'bg-accent text-dark'
                : 'bg-dark border border-accent/20 text-white hover:bg-accent/10'
            }`}
          >
            Prossimi 30 giorni
          </button>
          <button
            onClick={() => handleRangeChange('month')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              range === 'month'
                ? 'bg-accent text-dark'
                : 'bg-dark border border-accent/20 text-white hover:bg-accent/10'
            }`}
          >
            Questo mese
          </button>
        </div>
      </div>

      {/* Calendar Agenda */}
      <div className="space-y-6">
        {sortedDays.length === 0 ? (
          <div className="bg-dark border border-accent/20 rounded-lg p-12 text-center text-white/50">
            Nessun lavoro con scadenza nel periodo selezionato
          </div>
        ) : (
          sortedDays.map((day) => {
            const dayWorks = worksByDay[day]
            const dayDate = new Date(day)
            const isExpired = isPast(dayDate) && dayWorks.some((w) => w.status !== 'DONE')

            return (
              <div key={day} className="bg-dark border border-accent/20 rounded-lg overflow-hidden">
                <div className={`px-6 py-3 ${isExpired ? 'bg-red-500/20' : 'bg-accent/10'}`}>
                  <h2 className="text-lg font-semibold text-white">
                    {format(dayDate, 'EEEE, dd MMMM yyyy', { locale: it })}
                    {isExpired && <span className="ml-2 text-sm text-red-400">(Scaduto)</span>}
                  </h2>
                </div>
                <div className="divide-y divide-white/10">
                  {dayWorks.map((work) => {
                    const workDate = work.deadline ? new Date(work.deadline) : null
                    const isWorkExpired = workDate && isPast(workDate) && work.status !== 'DONE'

                    return (
                      <Link
                        key={work.id}
                        href={`/works/${work.id}`}
                        className="block px-6 py-4 hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {workDate && (
                                <span className="text-sm text-white/50">
                                  {format(workDate, 'HH:mm')}
                                </span>
                              )}
                              <h3 className={`font-medium ${isWorkExpired ? 'text-red-400' : 'text-white'}`}>
                                {work.title}
                              </h3>
                            </div>
                            <div className="text-sm text-white/70">
                              {work.client.name} • {work.category.name}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 text-xs rounded bg-accent/20 text-accent">
                              {statusLabels[work.status] || work.status}
                            </span>
                            {isWorkExpired && (
                              <span className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400">
                                Scaduto
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

