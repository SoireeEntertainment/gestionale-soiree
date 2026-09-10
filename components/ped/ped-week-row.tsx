'use client'

import { memo, type MutableRefObject, type MouseEvent, type DragEvent } from 'react'
import { getWorkStatusMeta } from '@/lib/work-status'
import type { PedDayCellData, PedItem, WorkDeadlineItem } from './ped-types'
import { PedDayColumn } from './ped-day-column'
import { PedTaskCard } from './ped-task-card'

const MIN_COL_WIDTH = 80
const ROW_HEIGHT = 100

export type PedWeekRowProps = {
  weekStartKey: string
  isCurrentWeek: boolean
  days: PedDayCellData[]
  extraItems: PedItem[]
  weekendWorks: WorkDeadlineItem[]
  columnWidths: number[]
  readOnly: boolean
  selectedItemIds: Set<string>
  onDragOver: (e: DragEvent) => void
  onDropOnDay: (dateKey: string, e: DragEvent) => void
  onDropOnExtra: (weekStartKey: string, e: DragEvent) => void
  onOpenAdd?: (dateKey: string) => void
  onOpenAddExtra?: (weekStartDateKey: string) => void
  onSelectDay?: (dateKey: string) => void
  onOpenWork?: (work: WorkDeadlineItem) => void
  onWorkContextMenu?: (x: number, y: number, work: WorkDeadlineItem) => void
  onToggleDone: (id: string) => void
  onOpenEdit: (item: PedItem) => void
  onItemClick: (e: MouseEvent, item: PedItem) => void
  onOpenContextMenu: (e: MouseEvent, item: PedItem) => void
  onReorderAtIndex: (dateKey: string, isExtra: boolean, dropIndex: number, e: DragEvent) => void
  showAsDelegated: (item: PedItem) => boolean
  getSelectedIds: () => string[]
  justDraggedRef: MutableRefObject<boolean>
}

function PedWeekRowInner({
  weekStartKey,
  isCurrentWeek,
  days,
  extraItems,
  weekendWorks,
  columnWidths,
  readOnly,
  selectedItemIds,
  onDragOver,
  onDropOnDay,
  onDropOnExtra,
  onOpenAdd,
  onOpenAddExtra,
  onSelectDay,
  onOpenWork,
  onWorkContextMenu,
  onToggleDone,
  onOpenEdit,
  onItemClick,
  onOpenContextMenu,
  onReorderAtIndex,
  showAsDelegated,
  getSelectedIds,
  justDraggedRef,
}: PedWeekRowProps) {
  return (
    <tr
      style={{ minHeight: ROW_HEIGHT }}
      data-week-start={weekStartKey}
      {...(isCurrentWeek ? { 'data-current-week': 'true' as const } : {})}
    >
      {days.map((cell, colIndex) => (
        <PedDayColumn
          key={cell.dateKey}
          dateKey={cell.dateKey}
          dayNum={cell.dayNum}
          isCurrentMonth={cell.isCurrentMonth}
          items={cell.items}
          works={cell.works}
          remainingCount={cell.remainingCount}
          remainingPct={cell.remainingPct}
          total={cell.total}
          done={cell.done}
          colWidth={columnWidths[colIndex]}
          readOnly={readOnly}
          selectedItemIds={selectedItemIds}
          onDragOver={onDragOver}
          onDropOnDay={onDropOnDay}
          onOpenAdd={onOpenAdd}
          onSelectDay={onSelectDay}
          onOpenWork={onOpenWork}
          onWorkContextMenu={onWorkContextMenu}
          onToggleDone={onToggleDone}
          onOpenEdit={onOpenEdit}
          onItemClick={onItemClick}
          onOpenContextMenu={onOpenContextMenu}
          onReorderAtIndex={onReorderAtIndex}
          showAsDelegated={showAsDelegated}
          getSelectedIds={getSelectedIds}
          justDraggedRef={justDraggedRef}
        />
      ))}
      <td
        className="align-top border border-white/10 p-2 bg-white/5"
        style={{
          width: columnWidths[5],
          minWidth: MIN_COL_WIDTH,
          minHeight: ROW_HEIGHT,
          verticalAlign: 'top',
        }}
        onDragOver={onDragOver}
        onDrop={(e) => onDropOnExtra(weekStartKey, e)}
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
          {weekendWorks.map((work) => {
            const statusMeta = getWorkStatusMeta(work.status)
            const dayLabel = new Date(work.date + 'T00:00:00.000Z').toLocaleDateString('it-IT', {
              weekday: 'short',
              day: '2-digit',
            })
            return (
              <li
                key={`work-${work.id}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenWork?.(work)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onWorkContextMenu?.(e.clientX, e.clientY, work)
                }}
                className="text-xs rounded px-2 py-1.5 border bg-cyan-500/15 border-cyan-500/40 text-cyan-200 cursor-pointer hover:bg-cyan-500/20"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="inline-flex items-center rounded-full border border-cyan-400/50 bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
                    Lavoro
                  </span>
                  <span className="text-[10px] text-cyan-100/75">{dayLabel}</span>
                </div>
                <div className="font-medium truncate">{work.title}</div>
                <div
                  className={`inline-flex mt-1 items-center rounded-full border px-1.5 py-0.5 text-[10px] ${statusMeta.badgeClassName}`}
                >
                  {statusMeta.label}
                </div>
              </li>
            )
          })}
          {extraItems.map((item, index) => (
            <PedTaskCard
              key={item.id}
              item={item}
              isSelected={selectedItemIds.has(item.id)}
              isDelegated={showAsDelegated(item)}
              readOnly={readOnly}
              index={index}
              dateKey={weekStartKey}
              isExtra
              onToggleDone={onToggleDone}
              onOpenEdit={onOpenEdit}
              onItemClick={onItemClick}
              onOpenContextMenu={onOpenContextMenu}
              onReorderAtIndex={onReorderAtIndex}
              getSelectedIds={getSelectedIds}
              justDraggedRef={justDraggedRef}
            />
          ))}
          <li
            className="min-h-2 rounded border border-transparent border-dashed hover:border-accent/30 transition-colors list-none"
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(e) => onReorderAtIndex(weekStartKey, true, extraItems.length, e)}
            aria-hidden
          />
        </ul>
      </td>
    </tr>
  )
}

function selectionForItemsUnchanged(
  items: PedItem[],
  prevSelected: Set<string>,
  nextSelected: Set<string>
): boolean {
  for (const item of items) {
    if (prevSelected.has(item.id) !== nextSelected.has(item.id)) return false
  }
  return true
}

function pedWeekRowPropsAreEqual(prev: PedWeekRowProps, next: PedWeekRowProps): boolean {
  if (prev.weekStartKey !== next.weekStartKey) return false
  if (prev.isCurrentWeek !== next.isCurrentWeek) return false
  if (prev.extraItems !== next.extraItems) return false
  if (prev.weekendWorks !== next.weekendWorks) return false
  if (prev.readOnly !== next.readOnly) return false
  if (prev.columnWidths !== next.columnWidths) {
    if (
      prev.columnWidths.length !== next.columnWidths.length ||
      prev.columnWidths.some((w, i) => w !== next.columnWidths[i])
    ) {
      return false
    }
  }
  if (prev.days.length !== next.days.length) return false
  for (let i = 0; i < next.days.length; i++) {
    const p = prev.days[i]
    const n = next.days[i]
    if (
      p.dateKey !== n.dateKey ||
      p.dayNum !== n.dayNum ||
      p.isCurrentMonth !== n.isCurrentMonth ||
      p.items !== n.items ||
      p.works !== n.works ||
      p.remainingCount !== n.remainingCount ||
      p.remainingPct !== n.remainingPct ||
      p.total !== n.total ||
      p.done !== n.done
    ) {
      return false
    }
    if (!selectionForItemsUnchanged(n.items, prev.selectedItemIds, next.selectedItemIds)) {
      return false
    }
  }
  if (!selectionForItemsUnchanged(next.extraItems, prev.selectedItemIds, next.selectedItemIds)) {
    return false
  }
  return true
}

export const PedWeekRow = memo(PedWeekRowInner, pedWeekRowPropsAreEqual)
