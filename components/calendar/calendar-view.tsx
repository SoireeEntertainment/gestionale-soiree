'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Work, Client, Category } from '@prisma/client'
import { format, startOfDay, isSameDay, isPast, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth } from 'date-fns'
import { it } from 'date-fns/locale'
import { showToast } from '@/lib/toast'

type CalendarEvent = {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  location?: string
  description?: string
}

interface CalendarViewProps {
  works: (Work & { client: Client; category: Category })[]
  initialRange?: string
  initialFrom: string
  initialTo: string
  isCalendarAdmin: boolean
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

const MAX_EVENTS_PER_CELL = 3

function getRangeDates(range: string): { from: string; to: string } {
  const now = new Date()
  let start: Date
  let end: Date
  switch (range) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      break
    case '7days':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
      break
    case '30days':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      start = startOfMonth(now)
      end = endOfMonth(now)
      break
    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)
  }
  return { from: format(start, 'yyyy-MM-dd'), to: format(end, 'yyyy-MM-dd') }
}

function eventToDayKey(ev: CalendarEvent): string {
  return ev.start.slice(0, 10)
}

function workToDayKey(work: Work & { client: Client; category: Category }): string {
  return work.deadline ? format(startOfDay(new Date(work.deadline)), 'yyyy-MM-dd') : ''
}

export function CalendarView({
  works,
  initialRange = '30days',
  initialFrom,
  initialTo,
  isCalendarAdmin,
}: CalendarViewProps) {
  const router = useRouter()
  const [range, setRange] = useState(initialRange)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [monthViewDate, setMonthViewDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null)
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null)

  const fetchEvents = useCallback(async (from: string, to: string) => {
    setLoadingEvents(true)
    setEventsError(null)
    try {
      const res = await fetch(`/api/calendar/events?from=${from}&to=${to}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Errore caricamento eventi')
      }
      const data = await res.json()
      setEvents(data)
    } catch (e) {
      setEventsError(e instanceof Error ? e.message : 'Errore')
      setEvents([])
    } finally {
      setLoadingEvents(false)
    }
  }, [])

  useEffect(() => {
    const { from, to } = range === 'month'
      ? { from: format(startOfMonth(monthViewDate), 'yyyy-MM-dd'), to: format(endOfMonth(monthViewDate), 'yyyy-MM-dd') }
      : getRangeDates(range)
    fetchEvents(from, to)
  }, [range, monthViewDate, fetchEvents])

  const handleRangeChange = (newRange: string) => {
    setRange(newRange)
    router.push(`/calendar?range=${newRange}`)
  }

  const refresh = () => {
    const { from, to } = range === 'month'
      ? { from: format(startOfMonth(monthViewDate), 'yyyy-MM-dd'), to: format(endOfMonth(monthViewDate), 'yyyy-MM-dd') }
      : getRangeDates(range)
    fetchEvents(from, to)
    router.refresh()
  }

  const worksByDay = works.reduce((acc, work) => {
    const day = workToDayKey(work)
    if (!day) return acc
    if (!acc[day]) acc[day] = []
    acc[day].push(work)
    return acc
  }, {} as Record<string, (Work & { client: Client; category: Category })[]>)

  const eventsByDay = events.reduce((acc, ev) => {
    const day = eventToDayKey(ev)
    if (!acc[day]) acc[day] = []
    acc[day].push(ev)
    return acc
  }, {} as Record<string, CalendarEvent[]>)

  const sortedDays = Array.from(
    new Set([...Object.keys(worksByDay), ...Object.keys(eventsByDay)])
  ).sort()

  const isMonthView = range === 'month'
  const monthStart = startOfMonth(monthViewDate)
  const monthEnd = endOfMonth(monthViewDate)
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const firstDayOfWeek = (monthStart.getDay() + 6) % 7
  const paddingDays = Array(firstDayOfWeek).fill(null)

  return (
    <div>
      {/* Range Filter + Admin actions */}
      <div className="bg-dark border border-accent/20 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => handleRangeChange('today')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              range === 'today' ? 'bg-accent text-dark' : 'bg-dark border border-accent/20 text-white hover:bg-accent/10'
            }`}
          >
            Oggi
          </button>
          <button
            onClick={() => handleRangeChange('7days')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              range === '7days' ? 'bg-accent text-dark' : 'bg-dark border border-accent/20 text-white hover:bg-accent/10'
            }`}
          >
            Prossimi 7 giorni
          </button>
          <button
            onClick={() => handleRangeChange('30days')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              range === '30days' ? 'bg-accent text-dark' : 'bg-dark border border-accent/20 text-white hover:bg-accent/10'
            }`}
          >
            Prossimi 30 giorni
          </button>
          <button
            onClick={() => handleRangeChange('month')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              range === 'month' ? 'bg-accent text-dark' : 'bg-dark border border-accent/20 text-white hover:bg-accent/10'
            }`}
          >
            Questo mese
          </button>
          <button
            onClick={refresh}
            className="px-4 py-2 rounded-md text-sm border border-accent/20 text-white hover:bg-accent/10"
          >
            Aggiorna
          </button>
          {isCalendarAdmin && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="ml-auto px-4 py-2 rounded-md text-sm bg-accent text-dark font-medium hover:opacity-90"
            >
              Nuovo evento
            </button>
          )}
        </div>
        {eventsError && (
          <p className="mt-2 text-sm text-red-400">{eventsError}</p>
        )}
        {loadingEvents && (
          <p className="mt-2 text-sm text-white/60">Caricamento eventi Google…</p>
        )}
      </div>

      {isMonthView ? (
        /* Vista mensile: griglia */
        <div className="bg-dark border border-accent/20 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <button
              type="button"
              onClick={() => setMonthViewDate((d) => subMonths(d, 1))}
              className="text-white hover:bg-white/10 rounded px-2 py-1"
            >
              ←
            </button>
            <h2 className="text-lg font-semibold text-white">
              {format(monthViewDate, 'MMMM yyyy', { locale: it })}
            </h2>
            <button
              type="button"
              onClick={() => setMonthViewDate((d) => addMonths(d, 1))}
              className="text-white hover:bg-white/10 rounded px-2 py-1"
            >
              →
            </button>
          </div>
          <div className="grid grid-cols-7 border-b border-white/10">
            {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((d) => (
              <div key={d} className="p-2 text-center text-xs font-medium text-white/60 border-r border-white/10 last:border-r-0">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-fr min-h-[400px]">
            {paddingDays.map((_, i) => (
              <div key={`pad-${i}`} className="border-r border-b border-white/10 bg-white/5 min-h-[80px]" />
            ))}
            {monthDays.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd')
              const dayWorks = worksByDay[dayKey] ?? []
              const dayEvents = eventsByDay[dayKey] ?? []
              const items = [
                ...dayEvents.map((e) => ({ type: 'event' as const, event: e })),
                ...dayWorks.map((w) => ({ type: 'work' as const, work: w })),
              ].sort((a, b) => {
                if (a.type === 'event' && b.type === 'event') return 0
                if (a.type === 'work' && b.type === 'work') return 0
                if (a.type === 'event') return -1
                return 1
              })
              const isCurrentMonth = isSameMonth(day, monthViewDate)
              return (
                <div
                  key={dayKey}
                  className={`border-r border-b border-white/10 min-h-[80px] p-1 ${isCurrentMonth ? 'bg-dark' : 'bg-white/5'}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDay(dayKey)}
                    className="w-full text-left text-sm font-medium text-white/80 hover:bg-white/10 rounded p-1"
                  >
                    {format(day, 'd')}
                  </button>
                  <div className="space-y-0.5">
                    {items.slice(0, MAX_EVENTS_PER_CELL).map((x) =>
                      x.type === 'event' ? (
                        <button
                          key={x.event.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDetailEvent(x.event)
                          }}
                          className="block w-full text-left text-xs truncate rounded px-1 py-0.5 bg-accent/20 text-accent hover:bg-accent/30"
                        >
                          {x.event.title}
                        </button>
                      ) : (
                        <Link
                          key={x.work.id}
                          href={`/works/${x.work.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block w-full text-left text-xs truncate rounded px-1 py-0.5 bg-white/10 text-white hover:bg-white/20"
                        >
                          {x.work.title}
                        </Link>
                      )
                    )}
                    {items.length > MAX_EVENTS_PER_CELL && (
                      <button
                        type="button"
                        onClick={() => setSelectedDay(dayKey)}
                        className="text-xs text-accent hover:underline"
                      >
                        +{items.length - MAX_EVENTS_PER_CELL}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* Vista agenda: lista per giorno */
        <div className="space-y-6">
          {sortedDays.length === 0 && events.length === 0 ? (
            <div className="bg-dark border border-accent/20 rounded-lg p-12 text-center text-white/50">
              Nessun lavoro o evento nel periodo selezionato
            </div>
          ) : (
            sortedDays.map((day) => {
              const dayWorks = worksByDay[day] ?? []
              const dayEvents = eventsByDay[day] ?? []
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
                    {dayEvents.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setDetailEvent(ev)}
                        className="w-full block px-6 py-4 hover:bg-white/5 transition-colors text-left"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <span className="text-sm text-accent/80 mr-2">Evento</span>
                            <h3 className="font-medium text-white inline">{ev.title}</h3>
                            {!ev.allDay && (
                              <span className="ml-2 text-sm text-white/50">
                                {format(new Date(ev.start), 'HH:mm')} – {format(new Date(ev.end), 'HH:mm')}
                              </span>
                            )}
                            {ev.location && (
                              <p className="text-sm text-white/60 mt-1">{ev.location}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
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
                                  <span className="text-sm text-white/50">{format(workDate, 'HH:mm')}</span>
                                )}
                                <h3 className={`font-medium ${isWorkExpired ? 'text-red-400' : 'text-white'}`}>
                                  {work.title}
                                </h3>
                              </div>
                              <div className="text-sm text-white/70">
                                {work.client.name} • {work.category.name}
                              </div>
                            </div>
                            <span className="px-2 py-1 text-xs rounded bg-accent/20 text-accent">
                              {statusLabels[work.status] || work.status}
                            </span>
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
      )}

      {/* Modal: giorno selezionato (lista eventi + lavori) */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedDay(null)}>
          <div className="bg-dark border border-accent/20 rounded-lg max-w-lg w-full max-h-[80vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-white mb-4">
              {format(new Date(selectedDay), 'EEEE, dd MMMM yyyy', { locale: it })}
            </h3>
            <div className="space-y-2">
              {(eventsByDay[selectedDay] ?? []).map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => {
                    setSelectedDay(null)
                    setDetailEvent(ev)
                  }}
                  className="w-full text-left px-4 py-2 rounded bg-accent/20 text-accent hover:bg-accent/30"
                >
                  {ev.title}
                </button>
              ))}
              {(worksByDay[selectedDay] ?? []).map((work) => (
                <Link
                  key={work.id}
                  href={`/works/${work.id}`}
                  className="block px-4 py-2 rounded bg-white/10 text-white hover:bg-white/20"
                >
                  {work.title}
                </Link>
              ))}
            </div>
            <button type="button" onClick={() => setSelectedDay(null)} className="mt-4 text-white/70 hover:text-white">
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* Modal: dettaglio evento (con Modifica / Elimina per admin) */}
      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          onClose={() => setDetailEvent(null)}
          onEdit={() => {
            setEditEvent(detailEvent)
            setDetailEvent(null)
          }}
          onDeleted={() => {
            setDetailEvent(null)
            refresh()
          }}
          isAdmin={isCalendarAdmin}
          refresh={refresh}
        />
      )}

      {/* Modal: crea evento */}
      {createModalOpen && (
        <EventFormModal
          onClose={() => setCreateModalOpen(false)}
          onSuccess={() => {
            setCreateModalOpen(false)
            refresh()
            showToast('Evento creato', 'success')
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* Modal: modifica evento */}
      {editEvent && (
        <EventFormModal
          event={editEvent}
          onClose={() => setEditEvent(null)}
          onSuccess={() => {
            setEditEvent(null)
            refresh()
            showToast('Evento aggiornato', 'success')
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
    </div>
  )
}

function EventDetailModal({
  event,
  onClose,
  onEdit,
  onDeleted,
  isAdmin,
  refresh,
}: {
  event: CalendarEvent
  onClose: () => void
  onEdit: () => void
  onDeleted: () => void
  isAdmin: boolean
  refresh: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      const res = await fetch(`/api/calendar/events/${event.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Errore eliminazione')
      }
      onDeleted()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-dark border border-accent/20 rounded-lg max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-semibold text-white mb-2">{event.title}</h3>
        <p className="text-white/80 text-sm">
          {event.allDay
            ? format(new Date(event.start), 'dd MMM yyyy', { locale: it })
            : `${format(new Date(event.start), 'dd MMM yyyy HH:mm', { locale: it })} – ${format(new Date(event.end), 'HH:mm', { locale: it })}`}
        </p>
        {event.location && <p className="text-white/60 text-sm mt-1">{event.location}</p>}
        {event.description && <p className="text-white/60 text-sm mt-2 whitespace-pre-wrap">{event.description}</p>}
        <div className="flex gap-2 mt-4">
          {isAdmin && (
            <>
              <button type="button" onClick={onEdit} className="px-4 py-2 rounded bg-accent text-dark font-medium">
                Modifica
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 rounded bg-red-500/20 text-red-400 font-medium"
              >
                {confirmDelete ? (deleting ? 'Eliminazione…' : 'Conferma eliminazione') : 'Elimina'}
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded border border-white/20 text-white">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}

function EventFormModal({
  event,
  onClose,
  onSuccess,
  onError,
}: {
  event?: CalendarEvent | null
  onClose: () => void
  onSuccess: () => void
  onError: (message: string) => void
}) {
  const isEdit = !!event
  const [title, setTitle] = useState(event?.title ?? '')
  const [allDay, setAllDay] = useState(event?.allDay ?? false)
  const [startDate, setStartDate] = useState(event ? event.start.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState(event && !event.allDay ? event.start.slice(11, 16) : '09:00')
  const [endDate, setEndDate] = useState(
    event ? (event.allDay ? event.end.slice(0, 10) : event.end.slice(0, 10)) : format(new Date(), 'yyyy-MM-dd')
  )
  const [endTime, setEndTime] = useState(event && !event.allDay ? event.end.slice(11, 16) : '10:00')
  const [location, setLocation] = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      onError('Inserisci un titolo')
      return
    }
    let start: string
    let end: string
    if (allDay) {
      start = `${startDate}T00:00:00.000Z`
      const endDay = new Date(endDate + 'T00:00:00.000Z')
      endDay.setUTCDate(endDay.getUTCDate() + 1)
      end = format(endDay, 'yyyy-MM-dd') + 'T00:00:00.000Z'
    } else {
      start = `${startDate}T${startTime}:00.000Z`
      end = `${endDate}T${endTime}:00.000Z`
    }
    if (new Date(end) <= new Date(start)) {
      onError('La data/ora fine deve essere dopo l\'inizio')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        const res = await fetch(`/api/calendar/events/${event.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            start,
            end,
            allDay,
            location: location.trim() || undefined,
            description: description.trim() || undefined,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Errore aggiornamento')
        }
      } else {
        const res = await fetch('/api/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            start,
            end,
            allDay,
            location: location.trim() || undefined,
            description: description.trim() || undefined,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Errore creazione')
        }
      }
      onSuccess()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Errore')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-dark border border-accent/20 rounded-lg max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-semibold text-white mb-4">{isEdit ? 'Modifica evento' : 'Nuovo evento'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-1">Titolo *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            <label htmlFor="allDay" className="text-sm text-white/70">Tutto il giorno</label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-1">Inizio</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white"
              />
              {!allDay && (
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded bg-white/10 border border-white/20 text-white"
                />
              )}
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Fine</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white"
              />
              {!allDay && (
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded bg-white/10 border border-white/20 text-white"
                />
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1">Luogo</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1">Descrizione</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded bg-white/10 border border-white/20 text-white"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-accent text-dark font-medium disabled:opacity-50">
              {saving ? 'Salvataggio…' : isEdit ? 'Salva' : 'Crea'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded border border-white/20 text-white">
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
