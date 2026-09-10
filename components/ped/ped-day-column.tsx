'use client'

import { memo, type MutableRefObject, type MouseEvent, type DragEvent } from 'react'
import { getWorkStatusMeta } from '@/lib/work-status'
import type { PedItem, WorkDeadlineItem } from './ped-types'
import { PedTaskCard } from './ped-task-card'

const MIN_COL_WIDTH = 80
const ROW_HEIGHT = 100

export type PedDayColumnProps = {
  dateKey: string
  dayNum: number
  isCurrentMonth: boolean
  items: PedItem[]
  works: WorkDeadlineItem[]
  remainingCount: number
  remainingPct: number
  total: number
  done: number
  colWidth: number
  readOnly: boolean
  selectedItemIds: Set<string>
  onDragOver: (e: DragEvent) => void
  onDropOnDay: (dateKey: string, e: DragEvent) => void
  onOpenAdd?: (dateKey: string) => void
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

function PedDayColumnInner({
  dateKey,
  dayNum,
  isCurrentMonth,
  items,
  works,
  remainingCount,
  remainingPct,
  total,
  colWidth,
  readOnly,
  selectedItemIds,
  onDragOver,
  onDropOnDay,
  onOpenAdd,
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
}: PedDayColumnProps) {
  return (
    <td
      className={`align-top border border-white/10 p-2 cursor-pointer ${
        isCurrentMonth ? 'bg-dark' : 'bg-white/5'
      }`}
      style={{
        width: colWidth,
        minWidth: MIN_COL_WIDTH,
        minHeight: ROW_HEIGHT,
        verticalAlign: 'top',
      }}
      onDragOver={onDragOver}
      onDrop={(e) => onDropOnDay(dateKey, e)}
      onClick={
        onOpenAdd && !readOnly
          ? (e) => {
              if (!(e.target as HTMLElement).closest('li')) onOpenAdd(dateKey)
            }
          : undefined
      }
    >
      <div className="flex justify-between items-center mb-1">
        <span
          role={onSelectDay ? 'button' : undefined}
          onClick={onSelectDay ? (e) => { e.stopPropagation(); onSelectDay(dateKey) } : undefined}
          className={`text-sm font-medium ${isCurrentMonth ? 'text-white' : 'text-white/40'} ${onSelectDay ? 'cursor-pointer hover:underline' : ''}`}
        >
          {dayNum}
        </span>
        {onOpenAdd && !readOnly && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenAdd(dateKey) }}
            className="text-accent hover:underline text-xs"
          >
            +
          </button>
        )}
      </div>
      {total > 0 && (
        <p className="text-xs text-white/60 mb-1">
          Rimanenti: {remainingCount} · {remainingPct}%
        </p>
      )}
      <ul className="space-y-1.5">
        {works.map((work) => {
          const statusMeta = getWorkStatusMeta(work.status)
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
                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] ${statusMeta.badgeClassName}`}>
                  {statusMeta.label}
                </span>
              </div>
              <div className="font-medium truncate">{work.title}</div>
              <div className="text-[10px] text-cyan-100/80 truncate">{work.client.name}</div>
            </li>
          )
        })}
        {items.map((item, index) => (
          <PedTaskCard
            key={item.id}
            item={item}
            isSelected={selectedItemIds.has(item.id)}
            isDelegated={showAsDelegated(item)}
            readOnly={readOnly}
            index={index}
            dateKey={dateKey}
            isExtra={false}
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
          onDrop={(e) => onReorderAtIndex(dateKey, false, items.length, e)}
          aria-hidden
        />
      </ul>
    </td>
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

function pedDayColumnPropsAreEqual(prev: PedDayColumnProps, next: PedDayColumnProps): boolean {
  return (
    prev.dateKey === next.dateKey &&
    prev.dayNum === next.dayNum &&
    prev.isCurrentMonth === next.isCurrentMonth &&
    prev.items === next.items &&
    prev.works === next.works &&
    prev.remainingCount === next.remainingCount &&
    prev.remainingPct === next.remainingPct &&
    prev.total === next.total &&
    prev.done === next.done &&
    prev.colWidth === next.colWidth &&
    prev.readOnly === next.readOnly &&
    selectionForItemsUnchanged(next.items, prev.selectedItemIds, next.selectedItemIds)
  )
}

export const PedDayColumn = memo(PedDayColumnInner, pedDayColumnPropsAreEqual)
