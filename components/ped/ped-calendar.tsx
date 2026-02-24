'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { PED_ITEM_TYPE_LABELS, PED_DELEGATED_STYLE, toDateString, getCurrentWeekStartString } from '@/lib/ped-utils'
import { getItemLabelStyle, PED_LABELS, PED_LABEL_CONFIG } from '@/lib/pedLabels'

const STORAGE_KEY_COLUMNS = 'ped-calendar-column-widths'
const DEFAULT_COL_WIDTH = 160
const DEFAULT_EXTRA_WIDTH = 140
const MIN_COL_WIDTH = 80
const ROW_HEIGHT = 100

function getISOWeekStartKey(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00.000Z')
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

type PedItem = {
  id: string
  date: string
  clientId: string
  kind: string
  type: string
  title: string
  priority?: string
  label?: string | null
  status: string
  description?: string | null
  workId?: string | null
  isExtra?: boolean
  assignedToUserId?: string | null
  assignedTo?: { id: string; name: string } | null
  owner?: { id: string; name: string } | null
  client: { id: string; name: string }
  work?: { id: string; title: string } | null
}

type DayCell = {
  dateKey: string
  dayNum: number
  isCurrentMonth: boolean
  items: PedItem[]
  remainingPct: number
  remainingCount: number
  total: number
  done: number
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Extra']

const DEFAULT_COLUMN_WIDTHS = [...Array(5).fill(DEFAULT_COL_WIDTH), DEFAULT_EXTRA_WIDTH] as number[]

function loadColumnWidthsFromStorage(): number[] | null {
  if (typeof window === 'undefined') return null
  try {
    const s = localStorage.getItem(STORAGE_KEY_COLUMNS)
    if (s) {
      const parsed = JSON.parse(s) as number[]
      if (Array.isArray(parsed) && parsed.length === 6) return parsed
      if (Array.isArray(parsed) && parsed.length === 8) {
        return [parsed[0], parsed[1], parsed[2], parsed[3], parsed[4], parsed[7]]
      }
    }
  } catch {}
  return null
}

function buildCalendarGrid(year: number, month: number): { dateKey: string; dayNum: number; isCurrentMonth: boolean }[][] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const last = new Date(Date.UTC(year, month, 0))
  const firstWeekday = (first.getUTCDay() + 6) % 7
  const daysInMonth = last.getUTCDate()
  const weeks: { dateKey: string; dayNum: number; isCurrentMonth: boolean }[][] = []
  let week: { dateKey: string; dayNum: number; isCurrentMonth: boolean }[] = []
  for (let i = 0; i < firstWeekday; i++) {
    const d = new Date(first)
    d.setUTCDate(d.getUTCDate() - (firstWeekday - i))
    week.push({ dateKey: toDateString(d), dayNum: d.getUTCDate(), isCurrentMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    week.push({
      dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      dayNum: day,
      isCurrentMonth: true,
    })
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    let nextDay = 1
    while (week.length < 7) {
      const d = new Date(Date.UTC(year, month, nextDay))
      week.push({ dateKey: toDateString(d), dayNum: nextDay, isCurrentMonth: false })
      nextDay++
    }
    weeks.push(week)
  }
  return weeks.map((w) => w.slice(0, 5))
}

const DRAG_TYPE = 'application/x-ped-item'

type ContextMenuState = { x: number; y: number; item: PedItem } | null
type MarqueeRect = { startX: number; startY: number; endX: number; endY: number }

/** Id dell'utente di cui si sta visualizzando il PED (per stile "delegated": usa i suoi colori, non quelli del loggato). */
export function PedCalendar({
  year,
  month,
  items,
  dailyStats,
  currentUserId,
  viewAsUserId = null,
  alwaysUsePriorityStyle = false,
  readOnly = false,
  onOpenAdd,
  onOpenAddExtra,
  onOpenEdit,
  onToggleDone,
  onSetLabel,
  onMoveItem,
  onMoveItems,
  onDuplicateItem,
  onDeleteItem,
  onBulkSetLabel,
  onBulkToggleDone,
  onBulkDelete,
  onReorderInDay,
  onSelectDay,
  filterClientId,
  filterType,
}: {
  year: number
  month: number
  items: PedItem[]
  dailyStats: Record<string, { total: number; done: number; remainingPct: number; remainingCount?: number }>
  currentUserId: string
  /** Quando si visualizza il PED di un altro utente, lo stile "delegated" è calcolato rispetto a lui (i suoi colori). */
  viewAsUserId?: string | null
  /** In scheda cliente: mostra sempre i colori per priorità (come le vede l'owner), mai viola "delegated". */
  alwaysUsePriorityStyle?: boolean
  readOnly?: boolean
  onOpenAdd?: (dateKey: string) => void
  onOpenAddExtra?: (weekStartDateKey: string) => void
  onOpenEdit: (item: PedItem) => void
  onToggleDone: (id: string) => void
  onSetLabel?: (id: string, label: string) => void | Promise<void>
  onMoveItem: (itemId: string, targetDate: string, targetIsExtra: boolean) => void | Promise<void>
  onMoveItems?: (itemIds: string[], targetDate: string, targetIsExtra: boolean) => void | Promise<void>
  onDuplicateItem: (itemId: string, targetDate: string, targetIsExtra: boolean) => void | Promise<void>
  onDeleteItem: (itemId: string) => void | Promise<void>
  onBulkSetLabel?: (ids: string[], label: string) => void | Promise<void>
  onBulkToggleDone?: (ids: string[], done: boolean) => void | Promise<void>
  onBulkDelete?: (ids: string[]) => void | Promise<void>
  onReorderInDay: (dateKey: string, isExtra: boolean, orderedItemIds: string[]) => void | Promise<void>
  onSelectDay?: (dateKey: string) => void
  filterClientId: string
  filterType: string
}) {
  const effectiveViewerId = viewAsUserId ?? currentUserId
  const showAsDelegated = (item: PedItem) =>
    !alwaysUsePriorityStyle && item.assignedToUserId != null && item.assignedToUserId !== effectiveViewerId
  const [columnWidths, setColumnWidths] = useState<number[]>(DEFAULT_COLUMN_WIDTHS)
  const [resizingCol, setResizingCol] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null)
  const marqueeRectRef = useRef<MarqueeRect | null>(null)
  const calendarScrollRef = useRef<HTMLDivElement>(null)
  const justDraggedRef = useRef(false)
  const mayPersistRef = useRef(false)
  const itemIdOrderRef = useRef<string[]>([])
  const didAutoScrollRef = useRef(false)
  itemIdOrderRef.current = items.map((i) => i.id)

  // Settimana corrente (ISO lunedì) per marcare la riga e auto-scroll una tantum
  const currentWeekStart = useMemo(() => getCurrentWeekStartString(), [])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('contextmenu', close)
    }
  }, [contextMenu])

  useEffect(() => {
    const storedCols = loadColumnWidthsFromStorage()
    if (storedCols) setColumnWidths(storedCols)
    const t = setTimeout(() => {
      mayPersistRef.current = true
    }, 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!mayPersistRef.current) return
    try {
      localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify(columnWidths))
    } catch {}
  }, [columnWidths])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedItemIds(new Set())
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleMarqueeStart = (e: React.MouseEvent) => {
    if (readOnly || resizingCol !== null) return
    const target = e.target as HTMLElement
    if (target.closest('li[data-ped-item-id]') || target.closest('th')) return
    e.preventDefault()
    marqueeStartRef.current = { x: e.clientX, y: e.clientY }
    setMarquee({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY })
  }

  const handleMarqueeMove = useMemo(() => {
    let raf = 0
    return (e: MouseEvent) => {
      if (!marqueeStartRef.current) return
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setMarquee((prev) => {
          if (!prev || !marqueeStartRef.current) return prev
          return {
            ...prev,
            endX: e.clientX,
            endY: e.clientY,
          }
        })
        raf = 0
      })
    }
  }, [])

  marqueeRectRef.current = marquee

  const handleMarqueeEnd = useCallback(() => {
    const rect = marqueeRectRef.current
    setMarquee(null)
    marqueeStartRef.current = null
    if (!rect || !calendarScrollRef.current) return
    const minX = Math.min(rect.startX, rect.endX)
    const maxX = Math.max(rect.startX, rect.endX)
    const minY = Math.min(rect.startY, rect.endY)
    const maxY = Math.max(rect.startY, rect.endY)
    const els = calendarScrollRef.current.querySelectorAll<HTMLElement>('[data-ped-item-id]')
    const ids = new Set<string>()
    els.forEach((el) => {
      const id = el.getAttribute('data-ped-item-id')
      if (!id) return
      const r = el.getBoundingClientRect()
      if (r.right < minX || r.left > maxX || r.bottom < minY || r.top > maxY) return
      ids.add(id)
    })
    setSelectedItemIds(ids)
  }, [])

  useEffect(() => {
    if (!marquee) return
    const onMove = (e: MouseEvent) => handleMarqueeMove(e)
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      handleMarqueeEnd()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [marquee, handleMarqueeMove, handleMarqueeEnd])

  // Auto-scroll alla settimana corrente una sola volta all'apertura (UX: evitare scroll manuale)
  useEffect(() => {
    if (didAutoScrollRef.current) return
    let attempts = 0
    const maxAttempts = 10
    const tryScroll = () => {
      const el = document.querySelector<HTMLElement>('[data-current-week="true"]')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        didAutoScrollRef.current = true
        return
      }
      attempts += 1
      if (attempts < maxAttempts) setTimeout(tryScroll, 80)
    }
    const t = setTimeout(tryScroll, 100)
    return () => clearTimeout(t)
  }, [])

  const handleItemClick = (e: React.MouseEvent, item: PedItem) => {
    if (justDraggedRef.current) return
    if (e.metaKey || e.ctrlKey) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev)
        if (next.has(item.id)) next.delete(item.id)
        else next.add(item.id)
        return next
      })
      return
    }
    if (e.shiftKey) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev)
        const order = itemIdOrderRef.current
        const idx = order.indexOf(item.id)
        if (idx === -1) {
          next.add(item.id)
          return next
        }
        const lastIdx = order.findIndex((id) => prev.has(id))
        if (lastIdx === -1) {
          next.add(item.id)
          return next
        }
        const from = Math.min(lastIdx, idx)
        const to = Math.max(lastIdx, idx)
        for (let i = from; i <= to; i++) next.add(order[i])
        return next
      })
      return
    }
    setSelectedItemIds((prev) => (prev.has(item.id) && prev.size === 1 ? new Set() : new Set([item.id])))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
  }

  type DragPayload = { id?: string; ids?: string[]; date: string; isExtra: boolean; copyMode?: boolean }
  const parseDragPayload = (raw: string): DragPayload | null => {
    try {
      return JSON.parse(raw) as DragPayload
    } catch {
      return null
    }
  }

  const handleDropOnDay = (targetDateKey: string) => (e: React.DragEvent) => {
    e.preventDefault()
    if (readOnly) return
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    const payload = parseDragPayload(raw)
    if (!payload) return
    const { date, isExtra, copyMode } = payload
    if (payload.ids && payload.ids.length > 0) {
      if (copyMode) return // bulk copy not implemented
      if (typeof onMoveItems === 'function') {
        queueMicrotask(() => { onMoveItems(payload.ids!, targetDateKey, false) })
      }
      return
    }
    const id = payload.id
    if (!id) return
    if (copyMode) {
      if (typeof onDuplicateItem === 'function') {
        queueMicrotask(() => { onDuplicateItem(id, targetDateKey, false) })
      }
      return
    }
    if (targetDateKey === date && !isExtra) return
    if (typeof onMoveItem === 'function') {
      queueMicrotask(() => { onMoveItem(id, targetDateKey, false) })
    }
  }

  const handleDropOnExtra = (weekStartKey: string) => (e: React.DragEvent) => {
    e.preventDefault()
    if (readOnly) return
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    const payload = parseDragPayload(raw)
    if (!payload) return
    const { date, isExtra, copyMode } = payload
    if (payload.ids && payload.ids.length > 0) {
      if (copyMode) return
      if (typeof onMoveItems === 'function') {
        queueMicrotask(() => { onMoveItems(payload.ids!, weekStartKey, true) })
      }
      return
    }
    const id = payload.id
    if (!id) return
    if (copyMode) {
      if (typeof onDuplicateItem === 'function') {
        queueMicrotask(() => { onDuplicateItem(id, weekStartKey, true) })
      }
      return
    }
    const currentWeek = getISOWeekStartKey(date)
    if (currentWeek === weekStartKey && isExtra) return
    if (typeof onMoveItem === 'function') {
      queueMicrotask(() => { onMoveItem(id, weekStartKey, true) })
    }
  }

  const handleReorderInDay = (
    dateKey: string,
    isExtra: boolean,
    items: PedItem[],
    dropIndex: number
  ) => (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (readOnly) return
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    const payload = parseDragPayload(raw)
    if (!payload) return
    const { date, isExtra: dragIsExtra, copyMode } = payload
    if (copyMode || dragIsExtra !== isExtra) return
    if (isExtra) {
      if (getISOWeekStartKey(date) !== dateKey) return
    } else {
      if (date !== dateKey && !payload.ids?.length) return
    }
    const currentIds = items.map((i) => i.id)
    if (payload.ids && payload.ids.length > 0) {
      const toInsert = payload.ids
      const needMove = toInsert.some((id) => !currentIds.includes(id))
      if (needMove) {
        if (typeof onMoveItems === 'function') {
          queueMicrotask(() => { onMoveItems(toInsert, dateKey, isExtra) })
        }
        return
      }
      const newOrder = currentIds.filter((x) => !toInsert.includes(x))
      newOrder.splice(dropIndex, 0, ...toInsert)
      const orderToSave = isExtra ? newOrder.filter((id) => items.find((i) => i.id === id)?.isExtra) : newOrder
      if (orderToSave.length > 0 && typeof onReorderInDay === 'function') {
        queueMicrotask(() => { onReorderInDay(dateKey, isExtra, orderToSave) })
      }
      return
    }
    const id = payload.id
    if (!id) return
    if (!currentIds.includes(id)) return
    const newOrder = currentIds.filter((x) => x !== id)
    newOrder.splice(dropIndex, 0, id)
    const orderToSave = isExtra ? newOrder.filter((id) => items.find((i) => i.id === id)?.isExtra) : newOrder
    if (orderToSave.length > 0 && typeof onReorderInDay === 'function') {
      queueMicrotask(() => { onReorderInDay(dateKey, isExtra, orderToSave) })
    }
  }

  const onColResizeStart = (colIndex: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    setResizingCol(colIndex)
    const startX = e.clientX
    const startW = columnWidths[colIndex]
    const onMove = (move: MouseEvent) => {
      const newW = Math.max(MIN_COL_WIDTH, startW + (move.clientX - startX))
      setColumnWidths((prev) => {
        const next = [...prev]
        next[colIndex] = newW
        return next
      })
    }
    const onUp = () => {
      setResizingCol(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const grid = useMemo(() => buildCalendarGrid(year, month), [year, month])

  // Date is derived from column: items are grouped by item.date (single source of truth dal DB)
  const itemsByDay = useMemo(() => {
    const map: Record<string, PedItem[]> = {}
    for (const item of items) {
      if (item.isExtra) continue
      const dateKey = item.date.slice(0, 10)
      const d = new Date(dateKey + 'T00:00:00.000Z')
      const day = d.getUTCDay()
      if (day === 0 || day === 6) continue
      if (filterClientId && item.clientId !== filterClientId) continue
      if (filterType && item.type !== filterType) continue
      if (!map[dateKey]) map[dateKey] = []
      map[dateKey].push(item)
    }
    return map
  }, [items, filterClientId, filterType])

  const extraItemsByWeek = useMemo(() => {
    const byWeek: Record<string, { weekend: PedItem[]; extra: PedItem[] }> = {}
    for (const item of items) {
      const dateKey = item.date.slice(0, 10)
      if (filterClientId && item.clientId !== filterClientId) continue
      if (filterType && item.type !== filterType) continue
      const weekStart = getISOWeekStartKey(dateKey)
      if (!byWeek[weekStart]) byWeek[weekStart] = { weekend: [], extra: [] }
      const d = new Date(dateKey + 'T00:00:00.000Z')
      const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6
      if (item.isExtra) byWeek[weekStart].extra.push(item)
      else if (isWeekend) byWeek[weekStart].weekend.push(item)
    }
    const map: Record<string, PedItem[]> = {}
    for (const weekStart of Object.keys(byWeek)) {
      const { weekend, extra } = byWeek[weekStart]
      weekend.sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)))
      map[weekStart] = [...weekend, ...extra]
    }
    return map
  }, [items, filterClientId, filterType])

  const cells: DayCell[][] = grid.map((week) =>
    week.map((cell) => {
      const dayItems = itemsByDay[cell.dateKey] ?? []
      const stats = dailyStats[cell.dateKey] ?? { total: 0, done: 0, remainingPct: 0, remainingCount: 0 }
      return {
        ...cell,
        items: dayItems,
        remainingPct: stats.remainingPct,
        remainingCount: stats.remainingCount ?? (stats.total - stats.done),
        total: stats.total,
        done: stats.done,
      }
    })
  )

  return (
    <div className="flex flex-col h-full min-h-0 [font-size:1.15em]">
      <div className="flex items-center gap-4 mb-2 pb-2 border-b border-white/10 flex-shrink-0 flex-wrap">
        <span className="text-white/40 text-xs">Trascina il bordo destro di un’intestazione di colonna per ridimensionarla. Alt+trascina per duplicare una voce. Tasto destro sulla voce per menu.</span>
        {selectedItemIds.size > 0 && (
          <span className="flex items-center gap-2 text-accent text-sm font-medium">
            <span>{selectedItemIds.size} selezionate</span>
            <button
              type="button"
              onClick={() => setSelectedItemIds(new Set())}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs"
            >
              Deseleziona
            </button>
          </span>
        )}
      </div>
      <div
        ref={calendarScrollRef}
        className="flex-1 min-h-0 overflow-auto relative"
        onMouseDown={handleMarqueeStart}
      >
        {marquee && (
          <div
            className="pointer-events-none fixed border-2 border-accent/80 bg-accent/10 z-20"
            style={{
              left: Math.min(marquee.startX, marquee.endX),
              top: Math.min(marquee.startY, marquee.endY),
              width: Math.abs(marquee.endX - marquee.startX),
              height: Math.abs(marquee.endY - marquee.startY),
            }}
          />
        )}
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <thead className="sticky top-0 z-10">
          <tr className="bg-accent/10">
            {WEEKDAY_LABELS.map((label, i) => (
              <th
                key={label}
                className="p-2 text-left text-xs font-medium text-accent uppercase border border-white/10 relative select-none bg-accent/10"
                style={{ width: columnWidths[i], minWidth: MIN_COL_WIDTH }}
              >
                {label}
                {i < 6 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onMouseDown={onColResizeStart(i)}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-accent/60 active:bg-accent rounded-sm transition-colors"
                    title="Trascina per ridimensionare la colonna"
                    aria-label="Ridimensiona colonna"
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cells.map((week, wi) => {
            const weekStartKey = getISOWeekStartKey(week[0].dateKey)
            const extraItems = extraItemsByWeek[weekStartKey] ?? []
            const isCurrentWeek = weekStartKey === currentWeekStart
            return (
              <tr
                key={wi}
                style={{ minHeight: ROW_HEIGHT }}
                data-week-start={weekStartKey}
                {...(isCurrentWeek ? { 'data-current-week': 'true' as const } : {})}
              >
                {week.map((cell, colIndex) => (
                  <td
                    key={cell.dateKey}
                    className={`align-top border border-white/10 p-2 cursor-pointer ${
                      cell.isCurrentMonth ? 'bg-dark' : 'bg-white/5'
                    }`}
                    style={{
                      width: columnWidths[colIndex],
                      minWidth: MIN_COL_WIDTH,
                      minHeight: ROW_HEIGHT,
                      verticalAlign: 'top',
                    }}
                    onDragOver={handleDragOver}
                    onDrop={handleDropOnDay(cell.dateKey)}
                    onClick={
                      onOpenAdd && !readOnly
                        ? (e) => {
                            if (!(e.target as HTMLElement).closest('li')) onOpenAdd(cell.dateKey)
                          }
                        : undefined
                    }
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span
                        role={onSelectDay ? 'button' : undefined}
                        onClick={onSelectDay ? (e) => { e.stopPropagation(); onSelectDay(cell.dateKey) } : undefined}
                        className={`text-sm font-medium ${cell.isCurrentMonth ? 'text-white' : 'text-white/40'} ${onSelectDay ? 'cursor-pointer hover:underline' : ''}`}
                      >
                        {cell.dayNum}
                      </span>
                      {onOpenAdd && !readOnly && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpenAdd(cell.dateKey) }}
                          className="text-accent hover:underline text-xs"
                        >
                          +
                        </button>
                      )}
                    </div>
                    {cell.total > 0 && (
                      <p className="text-xs text-white/60 mb-1">
                        Rimanenti: {cell.remainingCount} · {cell.remainingPct}%
                      </p>
                    )}
                    <ul className="space-y-1.5">
                      {cell.items.map((item, index) => {
                        const isDelegated = showAsDelegated(item)
                        const labelStyle = getItemLabelStyle(item)
                        const itemStyle = isDelegated
                          ? PED_DELEGATED_STYLE
                          : { backgroundColor: labelStyle.backgroundColor, color: labelStyle.color }
                        const itemDate = item.date.slice(0, 10)
                        return (
                          <li
                            key={item.id}
                            data-ped-item-id={item.id}
                            draggable={!readOnly}
                            onClick={readOnly ? undefined : (e) => handleItemClick(e, item)}
                            onDragOver={readOnly ? undefined : (e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              e.dataTransfer.dropEffect = 'move'
                            }}
                            onDrop={readOnly ? undefined : handleReorderInDay(cell.dateKey, false, cell.items, index)}
                            onDragStart={readOnly ? undefined : (e) => {
                              const copyMode = e.altKey
                              const ids = selectedItemIds.has(item.id) && selectedItemIds.size > 1
                                ? Array.from(selectedItemIds)
                                : [item.id]
                              const payload = ids.length > 1
                                ? { ids, date: itemDate, isExtra: Boolean(item.isExtra), copyMode }
                                : { id: item.id, date: itemDate, isExtra: Boolean(item.isExtra), copyMode }
                              e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
                              e.dataTransfer.effectAllowed = copyMode ? 'copy' : 'move'
                              if (ids.length > 1) {
                                e.dataTransfer.setData('text/plain', `${ids.length} task`)
                              }
                              justDraggedRef.current = true
                            }}
                            onDragEnd={readOnly ? undefined : () => {
                              setTimeout(() => { justDraggedRef.current = false }, 150)
                            }}
                            onContextMenu={readOnly ? undefined : (e) => {
                              e.preventDefault()
                              setContextMenu({ x: e.clientX, y: e.clientY, item })
                            }}
                            className={`text-xs flex items-center gap-2 rounded px-2 py-1.5 ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${selectedItemIds.has(item.id) ? 'ring-2 ring-accent ring-offset-1 ring-offset-dark' : ''}`}
                            style={itemStyle}
                          >
                            <input
                              type="checkbox"
                              checked={item.status === 'DONE'}
                              disabled={readOnly}
                              onChange={readOnly ? undefined : (ev) => { ev.stopPropagation(); onToggleDone(item.id) }}
                              className="shrink-0 border-white/50"
                              aria-label={item.status === 'DONE' ? 'Fatto' : 'Da fare'}
                            />
                            {isDelegated && (
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-90">Delegato</span>
                            )}
                            <span
                              className={`text-left truncate flex-1 min-w-0 font-medium ${readOnly ? '' : 'cursor-pointer hover:underline'}`}
                              onDoubleClick={readOnly ? undefined : (ev) => {
                                ev.stopPropagation()
                                if (justDraggedRef.current) return
                                onOpenEdit(item)
                              }}
                              role={readOnly ? undefined : 'button'}
                            >
                              <span className="font-bold">{item.client.name}</span> · {PED_ITEM_TYPE_LABELS[item.type] ?? item.type} · {item.title}
                            </span>
                            {item.owner?.name && (
                              <span className="shrink-0 text-[10px] text-white/60" title={`Creato da: ${item.owner.name}`}>
                                Dal PED di {item.owner.name}
                              </span>
                            )}
                          </li>
                        )
                      })}
                      <li
                        className="min-h-2 rounded border border-transparent border-dashed hover:border-accent/30 transition-colors list-none"
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          e.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={handleReorderInDay(cell.dateKey, false, cell.items, cell.items.length)}
                        aria-hidden
                      />
                    </ul>
                  </td>
                ))}
                {/* Colonna Extra per la settimana */}
                <td
                  className="align-top border border-white/10 p-2 bg-white/5"
                  style={{
                    width: columnWidths[5],
                    minWidth: MIN_COL_WIDTH,
                    minHeight: ROW_HEIGHT,
                    verticalAlign: 'top',
                  }}
                  onDragOver={handleDragOver}
                  onDrop={handleDropOnExtra(weekStartKey)}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-accent/90">Extra</span>
                    {onOpenAddExtra && !readOnly && (
                      <button
                        type="button"
                        onClick={() => onOpenAddExtra(weekStartKey)}
                        className="text-accent hover:underline text-xs"
                      >
                        +
                      </button>
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {extraItems.map((item, index) => {
                      const isDelegated = showAsDelegated(item)
                      const labelStyle = getItemLabelStyle(item)
                      const itemStyle = isDelegated
                        ? PED_DELEGATED_STYLE
                        : { backgroundColor: labelStyle.backgroundColor, color: labelStyle.color }
                      const itemDate = item.date.slice(0, 10)
                      return (
                        <li
                          key={item.id}
                          data-ped-item-id={item.id}
                          draggable={!readOnly}
                          onClick={readOnly ? undefined : (e) => handleItemClick(e, item)}
                          onDragOver={readOnly ? undefined : (e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            e.dataTransfer.dropEffect = 'move'
                          }}
                          onDrop={readOnly ? undefined : handleReorderInDay(weekStartKey, true, extraItems, index)}
                          onDragStart={readOnly ? undefined : (e) => {
                            const copyMode = e.altKey
                            const ids = selectedItemIds.has(item.id) && selectedItemIds.size > 1
                              ? Array.from(selectedItemIds)
                              : [item.id]
                            const payload = ids.length > 1
                              ? { ids, date: itemDate, isExtra: Boolean(item.isExtra), copyMode }
                              : { id: item.id, date: itemDate, isExtra: Boolean(item.isExtra), copyMode }
                            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
                            e.dataTransfer.effectAllowed = copyMode ? 'copy' : 'move'
                            if (ids.length > 1) {
                              e.dataTransfer.setData('text/plain', `${ids.length} task`)
                            }
                            justDraggedRef.current = true
                          }}
                          onDragEnd={readOnly ? undefined : () => {
                            setTimeout(() => { justDraggedRef.current = false }, 150)
                          }}
                          onContextMenu={readOnly ? undefined : (e) => {
                            e.preventDefault()
                            setContextMenu({ x: e.clientX, y: e.clientY, item })
                          }}
                          className={`text-xs flex items-center gap-2 rounded px-2 py-1.5 ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${selectedItemIds.has(item.id) ? 'ring-2 ring-accent ring-offset-1 ring-offset-dark' : ''}`}
                          style={itemStyle}
                        >
                          <input
                            type="checkbox"
                            checked={item.status === 'DONE'}
                            disabled={readOnly}
                            onChange={readOnly ? undefined : (ev) => { ev.stopPropagation(); onToggleDone(item.id) }}
                            className="shrink-0 border-white/50"
                            aria-label={item.status === 'DONE' ? 'Fatto' : 'Da fare'}
                          />
                          {isDelegated && (
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-90">Delegato</span>
                          )}
                          <span
                            className={`text-left truncate flex-1 min-w-0 font-medium ${readOnly ? '' : 'cursor-pointer hover:underline'}`}
                            onDoubleClick={readOnly ? undefined : (ev) => {
                              ev.stopPropagation()
                              if (justDraggedRef.current) return
                              onOpenEdit(item)
                            }}
                            role={readOnly ? undefined : 'button'}
                          >
                            <span className="font-bold">{item.client.name}</span> · {item.title}
                          </span>
                          {item.owner?.name && (
                            <span className="shrink-0 text-[10px] text-white/60" title={`Creato da: ${item.owner.name}`}>
                              Dal PED di {item.owner.name}
                            </span>
                          )}
                        </li>
                      )
                    })}
                    <li
                      className="min-h-2 rounded border border-transparent border-dashed hover:border-accent/30 transition-colors list-none"
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        e.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={handleReorderInDay(weekStartKey, true, extraItems, extraItems.length)}
                      aria-hidden
                    />
                  </ul>
                </td>
              </tr>
            )
          })}
        </tbody>
        </table>
      </div>

      {contextMenu && !readOnly && (() => {
        const isBulk = selectedItemIds.size >= 2 && selectedItemIds.has(contextMenu.item.id)
        const bulkIds = isBulk ? Array.from(selectedItemIds) : []
        return (
          <div
            className="fixed z-50 min-w-[220px] py-1 bg-dark border border-accent/20 rounded-lg shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1.5 text-xs font-semibold text-white/60 uppercase tracking-wide border-b border-white/10 mb-1">
              {isBulk ? `${bulkIds.length} task selezionate` : 'Imposta etichetta'}
            </div>
            {PED_LABELS.map((labelKey) => {
              const config = PED_LABEL_CONFIG[labelKey]
              return (
                <button
                  key={labelKey}
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/10"
                  style={{ color: config.color }}
                  onClick={() => {
                    if (isBulk && typeof onBulkSetLabel === 'function') {
                      queueMicrotask(() => { onBulkSetLabel(bulkIds, labelKey) })
                    } else if (!isBulk && typeof onSetLabel === 'function') {
                      queueMicrotask(() => { onSetLabel(contextMenu.item.id, labelKey) })
                    }
                    setContextMenu(null)
                  }}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: config.backgroundColor }}
                  />
                  {config.label}
                </button>
              )
            })}
            <div className="border-t border-white/10 my-1" />
            {isBulk && typeof onBulkToggleDone === 'function' && (
              <>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-white hover:bg-accent/10"
                  onClick={() => {
                    queueMicrotask(() => { onBulkToggleDone(bulkIds, true) })
                    setContextMenu(null)
                  }}
                >
                  Segna come fatto
                </button>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-white hover:bg-accent/10"
                  onClick={() => {
                    queueMicrotask(() => { onBulkToggleDone(bulkIds, false) })
                    setContextMenu(null)
                  }}
                >
                  Segna come non fatto
                </button>
              </>
            )}
            <button
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-accent/10"
              onClick={() => {
                if (isBulk && typeof onDuplicateItem === 'function') {
                  const dateKey = contextMenu.item.date.slice(0, 10)
                  const isExtra = Boolean(contextMenu.item.isExtra)
                  bulkIds.forEach((id) => { onDuplicateItem(id, dateKey, isExtra) })
                } else if (!isBulk && typeof onDuplicateItem === 'function') {
                  const dateKey = contextMenu.item.date.slice(0, 10)
                  onDuplicateItem(contextMenu.item.id, dateKey, Boolean(contextMenu.item.isExtra))
                }
                setContextMenu(null)
              }}
            >
              Duplica
            </button>
            <button
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/20"
              onClick={() => {
                if (isBulk && typeof onBulkDelete === 'function') {
                  if (confirm(`Eliminare le ${bulkIds.length} voci selezionate?`)) {
                    onBulkDelete(bulkIds)
                    setSelectedItemIds(new Set())
                  }
                  setContextMenu(null)
                } else if (!isBulk) {
                  if (confirm('Eliminare questa voce?')) {
                    onDeleteItem(contextMenu.item.id)
                  }
                  setContextMenu(null)
                }
              }}
            >
              Elimina
            </button>
          </div>
        )
      })()}
    </div>
  )
}
