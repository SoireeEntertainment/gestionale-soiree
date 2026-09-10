'use client'

import { memo, type MutableRefObject, type MouseEvent, type DragEvent } from 'react'
import { PED_ITEM_TYPE_LABELS, PED_DELEGATED_STYLE } from '@/lib/ped-utils'
import { getItemLabelStyle } from '@/lib/pedLabels'
import type { PedItem } from './ped-types'

export const DRAG_TYPE = 'application/x-ped-item'

export type PedTaskCardProps = {
  item: PedItem
  isSelected: boolean
  isDelegated: boolean
  readOnly: boolean
  index: number
  dateKey: string
  isExtra: boolean
  onToggleDone: (id: string) => void
  onOpenEdit: (item: PedItem) => void
  onItemClick: (e: MouseEvent, item: PedItem) => void
  onOpenContextMenu: (e: MouseEvent, item: PedItem) => void
  onReorderAtIndex: (dateKey: string, isExtra: boolean, dropIndex: number, e: DragEvent) => void
  getSelectedIds: () => string[]
  justDraggedRef: MutableRefObject<boolean>
}

function PedTaskCardInner({
  item,
  isSelected,
  isDelegated,
  readOnly,
  index,
  dateKey,
  isExtra,
  onToggleDone,
  onOpenEdit,
  onItemClick,
  onOpenContextMenu,
  onReorderAtIndex,
  getSelectedIds,
  justDraggedRef,
}: PedTaskCardProps) {
  const labelStyle = getItemLabelStyle(item)
  const itemStyle = isDelegated
    ? PED_DELEGATED_STYLE
    : { backgroundColor: labelStyle.backgroundColor, color: labelStyle.color }
  const itemDate = item.date.slice(0, 10)

  return (
    <li
      data-ped-item-id={item.id}
      draggable={!readOnly}
      onClick={readOnly ? undefined : (e) => onItemClick(e, item)}
      onDragOver={
        readOnly
          ? undefined
          : (e) => {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
            }
      }
      onDrop={readOnly ? undefined : (e) => onReorderAtIndex(dateKey, isExtra, index, e)}
      onDragStart={
        readOnly
          ? undefined
          : (e) => {
              const copyMode = e.altKey
              const selectedIds = getSelectedIds()
              const ids =
                selectedIds.includes(item.id) && selectedIds.length > 1 ? selectedIds : [item.id]
              const payload =
                ids.length > 1
                  ? { ids, date: itemDate, isExtra: Boolean(item.isExtra), copyMode }
                  : { id: item.id, date: itemDate, isExtra: Boolean(item.isExtra), copyMode }
              e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
              e.dataTransfer.effectAllowed = copyMode ? 'copy' : 'move'
              if (ids.length > 1) {
                e.dataTransfer.setData('text/plain', `${ids.length} task`)
              }
              justDraggedRef.current = true
            }
      }
      onDragEnd={
        readOnly
          ? undefined
          : () => {
              setTimeout(() => {
                justDraggedRef.current = false
              }, 150)
            }
      }
      onContextMenu={readOnly ? undefined : (e) => onOpenContextMenu(e, item)}
      className={`text-xs flex items-center gap-2 rounded px-2 py-1.5 ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${isSelected ? 'ring-2 ring-accent ring-offset-1 ring-offset-dark' : ''}`}
      style={itemStyle}
    >
      <input
        type="checkbox"
        checked={item.status === 'DONE'}
        disabled={readOnly}
        onChange={
          readOnly
            ? undefined
            : (ev) => {
                ev.stopPropagation()
                onToggleDone(item.id)
              }
        }
        className="shrink-0 border-white/50"
        aria-label={item.status === 'DONE' ? 'Fatto' : 'Da fare'}
      />
      {isDelegated && (
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-90">Delegato</span>
      )}
      <span
        className={`text-left truncate flex-1 min-w-0 font-medium ${readOnly ? '' : 'cursor-pointer hover:underline'}`}
        onDoubleClick={
          readOnly
            ? undefined
            : (ev) => {
                ev.stopPropagation()
                if (justDraggedRef.current) return
                onOpenEdit(item)
              }
        }
        role={readOnly ? undefined : 'button'}
      >
        {isExtra ? (
          <>
            <span className="font-bold">{item.client.name}</span> · {item.title}
          </>
        ) : (
          <>
            <span className="font-bold">{item.client.name}</span> · {PED_ITEM_TYPE_LABELS[item.type] ?? item.type} ·{' '}
            {item.title}
          </>
        )}
      </span>
      {item.owner?.name && (
        <span className="shrink-0 text-[10px] text-white/60" title={`Creato da: ${item.owner.name}`}>
          Dal PED di {item.owner.name}
        </span>
      )}
    </li>
  )
}

function pedTaskCardPropsAreEqual(prev: PedTaskCardProps, next: PedTaskCardProps): boolean {
  return (
    prev.item.id === next.item.id &&
    prev.item.status === next.item.status &&
    prev.item.label === next.item.label &&
    prev.item.title === next.item.title &&
    prev.item.client.name === next.item.client.name &&
    prev.item.owner?.name === next.item.owner?.name &&
    prev.item.type === next.item.type &&
    prev.item.assignedToUserId === next.item.assignedToUserId &&
    prev.isSelected === next.isSelected &&
    prev.isDelegated === next.isDelegated &&
    prev.readOnly === next.readOnly &&
    prev.index === next.index
  )
}

export const PedTaskCard = memo(PedTaskCardInner, pedTaskCardPropsAreEqual)
