'use client'

import { memo, type MutableRefObject, type MouseEvent, type DragEvent, type RefObject } from 'react'
import type { PedDayCellData, PedItem, WorkDeadlineItem } from './ped-types'
import { PedWeekRow } from './ped-week-row'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Extra']
const MIN_COL_WIDTH = 80

export type PedCalendarWeekRowData = {
  weekStartKey: string
  days: PedDayCellData[]
  extraItems: PedItem[]
  weekendWorks: WorkDeadlineItem[]
  isCurrentWeek: boolean
}

export type PedCalendarGridProps = {
  weekRows: PedCalendarWeekRowData[]
  columnWidths: number[]
  selectedCount: number
  selectedItemIds: Set<string>
  readOnly: boolean
  marquee: { startX: number; startY: number; endX: number; endY: number } | null
  calendarScrollRef: RefObject<HTMLDivElement | null>
  onMarqueeStart: (e: MouseEvent) => void
  onColResizeStart: (colIndex: number) => (e: MouseEvent) => void
  onClearSelection: () => void
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

function PedCalendarGridInner({
  weekRows,
  columnWidths,
  selectedCount,
  selectedItemIds,
  readOnly,
  marquee,
  calendarScrollRef,
  onMarqueeStart,
  onColResizeStart,
  onClearSelection,
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
}: PedCalendarGridProps) {
  return (
    <>
      <div className="flex items-center gap-4 mb-2 pb-2 border-b border-white/10 flex-shrink-0 flex-wrap">
        <span className="text-white/40 text-xs">
          Trascina il bordo destro di un’intestazione di colonna per ridimensionarla. Alt+trascina per
          duplicare una voce. Tasto destro sulla voce per menu.
        </span>
        {selectedCount > 0 && (
          <span className="flex items-center gap-2 text-accent text-sm font-medium">
            <span>{selectedCount} selezionate</span>
            <button
              type="button"
              onClick={onClearSelection}
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
        onMouseDown={onMarqueeStart}
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
            {weekRows.map((row) => (
              <PedWeekRow
                key={row.weekStartKey}
                weekStartKey={row.weekStartKey}
                isCurrentWeek={row.isCurrentWeek}
                days={row.days}
                extraItems={row.extraItems}
                weekendWorks={row.weekendWorks}
                columnWidths={columnWidths}
                readOnly={readOnly}
                selectedItemIds={selectedItemIds}
                onDragOver={onDragOver}
                onDropOnDay={onDropOnDay}
                onDropOnExtra={onDropOnExtra}
                onOpenAdd={onOpenAdd}
                onOpenAddExtra={onOpenAddExtra}
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
          </tbody>
        </table>
      </div>
    </>
  )
}

function pedCalendarGridPropsAreEqual(prev: PedCalendarGridProps, next: PedCalendarGridProps): boolean {
  if (prev.weekRows !== next.weekRows) return false
  if (prev.selectedItemIds !== next.selectedItemIds) {
    // Membership-only: if size differs or any id differs, fail
    if (prev.selectedItemIds.size !== next.selectedItemIds.size) return false
    for (const id of next.selectedItemIds) {
      if (!prev.selectedItemIds.has(id)) return false
    }
  }
  if (prev.selectedCount !== next.selectedCount) return false
  if (prev.readOnly !== next.readOnly) return false
  if (prev.marquee !== next.marquee) return false
  if (prev.columnWidths !== next.columnWidths) {
    if (
      prev.columnWidths.length !== next.columnWidths.length ||
      prev.columnWidths.some((w, i) => w !== next.columnWidths[i])
    ) {
      return false
    }
  }
  return true
}

export const PedCalendarGrid = memo(PedCalendarGridInner, pedCalendarGridPropsAreEqual)
