'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { PED_PRIORITY_COLORS, PED_ITEM_TYPE_LABELS, PED_DELEGATED_STYLE, toDateString } from '@/lib/ped-utils'

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
  priority: string
  status: string
  description?: string | null
  workId?: string | null
  isExtra?: boolean
  assignedToUserId?: string | null
  assignedTo?: { id: string; name: string } | null
  client: { id: string; name: string }
}

type DayCell = {
  dateKey: string
  dayNum: number
  isCurrentMonth: boolean
  items: PedItem[]
  remainingPct: number
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

export function PedCalendar({
  year,
  month,
  items,
  dailyStats,
  currentUserId,
  onOpenAdd,
  onOpenAddExtra,
  onOpenEdit,
  onToggleDone,
  onMoveItem,
  onDuplicateItem,
  onDeleteItem,
  onReorderInDay,
  onSelectDay,
  filterClientId,
  filterType,
}: {
  year: number
  month: number
  items: PedItem[]
  dailyStats: Record<string, { total: number; done: number; remainingPct: number }>
  currentUserId: string
  onOpenAdd?: (dateKey: string) => void
  onOpenAddExtra?: (weekStartDateKey: string) => void
  onOpenEdit: (item: PedItem) => void
  onToggleDone: (id: string) => void
  onMoveItem: (itemId: string, targetDate: string, targetIsExtra: boolean) => void | Promise<void>
  onDuplicateItem: (itemId: string, targetDate: string, targetIsExtra: boolean) => void | Promise<void>
  onDeleteItem: (itemId: string) => void | Promise<void>
  onReorderInDay: (dateKey: string, isExtra: boolean, orderedItemIds: string[]) => void | Promise<void>
  onSelectDay?: (dateKey: string) => void
  filterClientId: string
  filterType: string
}) {
  const [columnWidths, setColumnWidths] = useState<number[]>(DEFAULT_COLUMN_WIDTHS)
  const [resizingCol, setResizingCol] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const justDraggedRef = useRef(false)
  const mayPersistRef = useRef(false)

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
  }

  const handleDropOnDay = (targetDateKey: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    try {
      const { id, date, isExtra, copyMode } = JSON.parse(raw) as { id: string; date: string; isExtra: boolean; copyMode?: boolean }
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
    } catch {}
  }

  const handleDropOnExtra = (weekStartKey: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    try {
      const { id, date, isExtra, copyMode } = JSON.parse(raw) as { id: string; date: string; isExtra: boolean; copyMode?: boolean }
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
    } catch {}
  }

  const handleReorderInDay = (
    dateKey: string,
    isExtra: boolean,
    items: PedItem[],
    dropIndex: number
  ) => (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    try {
      const { id, date, isExtra: dragIsExtra, copyMode } = JSON.parse(raw) as {
        id: string
        date: string
        isExtra: boolean
        copyMode?: boolean
      }
      if (copyMode || dragIsExtra !== isExtra) return
      if (isExtra) {
        if (getISOWeekStartKey(date) !== dateKey) return
      } else {
        if (date !== dateKey) return
      }
      const ids = items.map((i) => i.id)
      if (!ids.includes(id)) return
      const newOrder = ids.filter((x) => x !== id)
      newOrder.splice(dropIndex, 0, id)
      const orderToSave = isExtra ? newOrder.filter((id) => items.find((i) => i.id === id)?.isExtra) : newOrder
      if (orderToSave.length > 0 && typeof onReorderInDay === 'function') {
        queueMicrotask(() => { onReorderInDay(dateKey, isExtra, orderToSave) })
      }
    } catch {}
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
      const stats = dailyStats[cell.dateKey] ?? { total: 0, done: 0, remainingPct: 0 }
      return {
        ...cell,
        items: dayItems,
        remainingPct: stats.remainingPct,
        total: stats.total,
        done: stats.done,
      }
    })
  )

  return (
    <div className="flex flex-col h-full min-h-0 [font-size:1.15em]">
      <div className="flex items-center gap-4 mb-2 pb-2 border-b border-white/10 flex-shrink-0">
        <span className="text-white/40 text-xs">Trascina il bordo destro di un’intestazione di colonna per ridimensionarla. Alt+trascina per duplicare una voce. Tasto destro sulla voce per menu.</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
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
            return (
              <tr key={wi} style={{ minHeight: ROW_HEIGHT }}>
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
                      onOpenAdd
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
                      {onOpenAdd && (
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
                      <p className="text-xs text-white/60 mb-1">{cell.remainingPct}% rimanenti</p>
                    )}
                    <ul className="space-y-1.5">
                      {cell.items.map((item, index) => {
                        const isDelegated = item.assignedToUserId != null && item.assignedToUserId !== currentUserId
                        const colors = PED_PRIORITY_COLORS[item.priority] ?? PED_PRIORITY_COLORS.MEDIUM
                        const doneStyle = item.status === 'DONE' ? PED_PRIORITY_COLORS.NOT_URGENT : null
                        const itemStyle = isDelegated
                          ? PED_DELEGATED_STYLE
                          : { backgroundColor: doneStyle ? doneStyle.backgroundColor : colors.backgroundColor, color: doneStyle ? doneStyle.color : colors.color }
                        const itemDate = item.date.slice(0, 10)
                        return (
                          <li
                            key={item.id}
                            draggable
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              e.dataTransfer.dropEffect = 'move'
                            }}
                            onDrop={handleReorderInDay(cell.dateKey, false, cell.items, index)}
                            onDragStart={(e) => {
                              const copyMode = e.altKey
                              e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({
                                id: item.id,
                                date: itemDate,
                                isExtra: Boolean(item.isExtra),
                                copyMode,
                              }))
                              e.dataTransfer.effectAllowed = copyMode ? 'copy' : 'move'
                              justDraggedRef.current = true
                            }}
                            onDragEnd={() => {
                              setTimeout(() => { justDraggedRef.current = false }, 150)
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              setContextMenu({ x: e.clientX, y: e.clientY, item })
                            }}
                            className="text-xs flex items-center gap-2 cursor-grab active:cursor-grabbing rounded px-2 py-1.5"
                            style={itemStyle}
                          >
                            <input
                              type="checkbox"
                              checked={item.status === 'DONE'}
                              onChange={() => onToggleDone(item.id)}
                              className="shrink-0 border-white/50"
                              aria-label={item.status === 'DONE' ? 'Fatto' : 'Da fare'}
                            />
                            {isDelegated && (
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-90">Delegato</span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (justDraggedRef.current) return
                                onOpenEdit(item)
                              }}
                              className="text-left hover:underline truncate flex-1 min-w-0 font-medium"
                            >
                              <span className="font-bold">{item.client.name}</span> · {PED_ITEM_TYPE_LABELS[item.type] ?? item.type} · {item.title}
                            </button>
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
                    {onOpenAddExtra && (
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
                      const isDelegated = item.assignedToUserId != null && item.assignedToUserId !== currentUserId
                      const colors = PED_PRIORITY_COLORS[item.priority] ?? PED_PRIORITY_COLORS.MEDIUM
                      const doneStyle = item.status === 'DONE' ? PED_PRIORITY_COLORS.NOT_URGENT : null
                      const itemStyle = isDelegated
                        ? PED_DELEGATED_STYLE
                        : { backgroundColor: doneStyle ? doneStyle.backgroundColor : colors.backgroundColor, color: doneStyle ? doneStyle.color : colors.color }
                      const itemDate = item.date.slice(0, 10)
                      return (
                        <li
                          key={item.id}
                          draggable
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            e.dataTransfer.dropEffect = 'move'
                          }}
                          onDrop={handleReorderInDay(weekStartKey, true, extraItems, index)}
                          onDragStart={(e) => {
                            const copyMode = e.altKey
                            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({
                              id: item.id,
                              date: itemDate,
                              isExtra: Boolean(item.isExtra),
                              copyMode,
                            }))
                            e.dataTransfer.effectAllowed = copyMode ? 'copy' : 'move'
                            justDraggedRef.current = true
                          }}
                          onDragEnd={() => {
                            setTimeout(() => { justDraggedRef.current = false }, 150)
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setContextMenu({ x: e.clientX, y: e.clientY, item })
                          }}
                          className="text-xs flex items-center gap-2 cursor-grab active:cursor-grabbing rounded px-2 py-1.5"
                          style={itemStyle}
                        >
                          <input
                            type="checkbox"
                            checked={item.status === 'DONE'}
                            onChange={() => onToggleDone(item.id)}
                            className="shrink-0 border-white/50"
                            aria-label={item.status === 'DONE' ? 'Fatto' : 'Da fare'}
                          />
                          {isDelegated && (
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-90">Delegato</span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (justDraggedRef.current) return
                              onOpenEdit(item)
                            }}
                            className="text-left hover:underline truncate flex-1 min-w-0 font-medium"
                          >
                            <span className="font-bold">{item.client.name}</span> · {item.title}
                          </button>
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

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] py-1 bg-dark border border-accent/20 rounded-lg shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-accent/10"
            onClick={() => {
              onOpenEdit(contextMenu.item)
              setContextMenu(null)
            }}
          >
            Modifica titolo
          </button>
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-accent/10"
            onClick={() => {
              const dateKey = contextMenu.item.date.slice(0, 10)
              if (typeof onDuplicateItem === 'function') {
                queueMicrotask(() => {
                  onDuplicateItem(contextMenu.item.id, dateKey, Boolean(contextMenu.item.isExtra))
                })
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
              if (confirm('Eliminare questa voce?')) {
                onDeleteItem(contextMenu.item.id)
              }
              setContextMenu(null)
            }}
          >
            Elimina
          </button>
        </div>
      )}
    </div>
  )
}
