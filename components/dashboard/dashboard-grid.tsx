'use client'

import { useState, useCallback, useEffect } from 'react'
import { DashboardStats } from './dashboard-stats'
import { DashboardPedToday } from './dashboard-ped-today'
import { DashboardTeamLoadOverview } from './dashboard-team-load-overview'
import type { PedLabel } from '@/lib/pedLabels'
import type { TeamLoadUserRow } from '@/app/actions/profilo'

const STORAGE_KEY = 'dashboard-widget-order'
const DEFAULT_ORDER: string[] = ['stats', 'ped-today', 'team-overview']

interface Work {
  id: string
  title: string
  deadline: Date | null
  client: { name: string }
  category: { name: string }
}

export type DashboardGridProps = {
  totalClients: number
  totalWorks: number
  worksInDeadline: Work[]
  expiredWorks: Work[]
  inReviewWorks: Work[]
  pedDailyStatsByLabel: Record<PedLabel, number>
  teamLoadRows: TeamLoadUserRow[]
}

export function DashboardGrid({
  totalClients,
  totalWorks,
  worksInDeadline,
  expiredWorks,
  inReviewWorks,
  pedDailyStatsByLabel,
  teamLoadRows,
}: DashboardGridProps) {
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
      if (raw) {
        const parsed = JSON.parse(raw) as string[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((id) => DEFAULT_ORDER.includes(id))
          const missing = DEFAULT_ORDER.filter((id) => !valid.includes(id))
          setOrder([...valid, ...missing])
          return
        }
      }
    } catch {
      // ignore
    }
  }, [])

  const persistOrder = useCallback((next: string[]) => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }, [])

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    setDraggedId(null)
    if (!id || id === targetId) return
    setOrder((prev) => {
      const from = prev.indexOf(id)
      const to = prev.indexOf(targetId)
      if (from === -1 || to === -1) return prev
      const next = [...prev]
      next.splice(from, 1)
      next.splice(to, 0, id)
      persistOrder(next)
      return next
    })
  }

  const handleDragEnd = () => {
    setDraggedId(null)
  }

  const widgets: Record<string, React.ReactNode> = {
    stats: (
      <DashboardStats
        totalClients={totalClients}
        totalWorks={totalWorks}
        worksInDeadline={worksInDeadline}
        expiredWorks={expiredWorks}
        inReviewWorks={inReviewWorks}
      />
    ),
    'ped-today': <DashboardPedToday byLabel={pedDailyStatsByLabel} />,
    'team-overview': <DashboardTeamLoadOverview rows={teamLoadRows} />,
  }

  const widgetLabels: Record<string, string> = {
    stats: 'Statistiche e lavori',
    'ped-today': 'Task di oggi (PED)',
    'team-overview': 'Carico team',
  }

  const visibleOrder = order.filter((id) => id !== 'team-overview' || teamLoadRows.length > 0)

  return (
    <div className="grid grid-cols-1 gap-6 mt-6" style={{ gridTemplateColumns: '1fr' }}>
      {visibleOrder.map((id) => {
        const child = widgets[id]
        if (!child) return null
        return (
          <div
            key={id}
            draggable
            onDragStart={(e) => handleDragStart(e, id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, id)}
            onDragEnd={handleDragEnd}
            className={`rounded-xl border transition-opacity ${
              draggedId === id ? 'opacity-50' : 'opacity-100'
            } ${draggedId ? 'border-accent/40' : 'border-transparent'} cursor-grab active:cursor-grabbing`}
          >
            <div className="flex items-center gap-2 px-2 py-1.5 bg-white/5 rounded-t-xl border-b border-white/10 text-xs text-white/50">
              <span className="inline-block w-2 h-2 rounded-full bg-accent/60" aria-hidden />
              {widgetLabels[id]}
              <span className="ml-1 text-white/40">— Trascina per riordinare</span>
            </div>
            <div className="p-4 rounded-b-xl">{child}</div>
          </div>
        )
      })}
    </div>
  )
}
