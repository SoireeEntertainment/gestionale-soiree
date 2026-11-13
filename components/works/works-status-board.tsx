'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { BoardWorkCard } from '@/lib/works-board'
import {
  BOARD_EASE,
  WORKS_DONE_DROP_ID,
  computeIsOverdue,
  getWorksStatusBoardLabel,
  sortBoardWorksByDeadline,
} from '@/lib/works-board'
import type { WorkStatus } from '@/lib/work-status'
import { WORK_STATUS_META } from '@/lib/work-status'
import {
  applyStatusOnStatusBoard,
  isArchiveDropId,
  isQuickBoardStatus,
  removeWorkFromStatusBoard,
} from '@/lib/work-board-quick-actions'
import { moveWorkStatusOnBoard } from '@/app/actions/works-board'
import { deleteWork } from '@/app/actions/works'
import { DraggableWorkBoardCard, WorkBoardCardContent } from '@/components/works/work-board-card'
import { WorkRescheduleDialog } from '@/components/works/work-reschedule-dialog'
import { WorkDeleteDialog } from '@/components/works/work-delete-dialog'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Archive } from 'lucide-react'

type StatusColumn = {
  status: WorkStatus
  works: BoardWorkCard[]
  count: number
}

function StatusColumnView({
  column,
  canEdit,
  returnTo,
  isOver,
  pendingWorkId,
  onReschedule,
  onArchive,
  onDelete,
  onStatusChange,
}: {
  column: StatusColumn
  canEdit: boolean
  returnTo: string
  isOver: boolean
  pendingWorkId: string | null
  onReschedule?: (work: BoardWorkCard) => void
  onArchive?: (work: BoardWorkCard) => void
  onDelete?: (work: BoardWorkCard) => void
  onStatusChange?: (work: BoardWorkCard, status: WorkStatus) => void
}) {
  const { setNodeRef } = useDroppable({
    id: column.status,
    data: { type: 'status-column', status: column.status },
  })
  const meta = WORK_STATUS_META[column.status]

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex min-h-[380px] min-w-[240px] flex-1 flex-col rounded-2xl border bg-[#101317]/90',
        'transition-[border-color,background-color,box-shadow] duration-300',
        isOver ? 'border-accent/55 bg-accent/5 shadow-lg shadow-accent/10' : 'border-accent/15'
      )}
      style={{ transitionTimingFunction: BOARD_EASE }}
    >
      <header className="sticky top-0 z-10 rounded-t-2xl border-b border-accent/10 bg-[#101317]/95 px-3 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('h-2.5 w-2.5 rounded-full border', meta.badgeClassName.split(' ').slice(0, 2).join(' '))} />
            <h2 className="truncate text-sm font-semibold text-white">{getWorksStatusBoardLabel(column.status)}</h2>
          </div>
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-medium text-white/70">
            {column.count}
          </span>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {column.works.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/35">Vuoto</p>
        ) : (
          column.works.map((work) => (
            <DraggableWorkBoardCard
              key={`${column.status}-${work.id}`}
              work={work}
              columnId={column.status}
              href={`/works/${work.id}?returnTo=${encodeURIComponent(returnTo)}`}
              disabled={!canEdit}
              pending={pendingWorkId === work.id}
              onReschedule={canEdit ? onReschedule : undefined}
              onArchive={canEdit ? onArchive : undefined}
              onDelete={canEdit ? onDelete : undefined}
              onStatusChange={canEdit ? onStatusChange : undefined}
            />
          ))
        )}
      </div>
    </section>
  )
}

function DoneArchiveDropzone({ isOver }: { isOver: boolean }) {
  const { setNodeRef } = useDroppable({
    id: WORKS_DONE_DROP_ID,
    data: { type: 'archive', status: WORKS_DONE_DROP_ID },
  })

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'mt-3 flex min-h-[72px] items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-4',
        'transition-[border-color,background-color,box-shadow] duration-300',
        isOver
          ? 'border-emerald-400/60 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
          : 'border-emerald-500/25 bg-emerald-500/[0.04]'
      )}
      style={{ transitionTimingFunction: BOARD_EASE }}
      aria-label="Fatto — Archivia"
    >
      <Archive className={cn('h-4 w-4', isOver ? 'text-emerald-300' : 'text-emerald-400/70')} aria-hidden />
      <div className="text-center">
        <p className={cn('text-sm font-semibold', isOver ? 'text-emerald-200' : 'text-emerald-300/90')}>
          Fatto — Archivia
        </p>
        <p className="text-[11px] text-white/40">Trascina qui per completare e archiviare</p>
      </div>
    </section>
  )
}

export function WorksStatusBoard({
  initialColumns,
  canEdit,
  returnTo,
}: {
  initialColumns: StatusColumn[]
  canEdit: boolean
  returnTo: string
}) {
  const router = useRouter()
  const [columns, setColumns] = useState(initialColumns)
  const [activeWork, setActiveWork] = useState<BoardWorkCard | null>(null)
  const [overStatus, setOverStatus] = useState<string | null>(null)
  const [rescheduleWork, setRescheduleWork] = useState<BoardWorkCard | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BoardWorkCard | null>(null)
  const [pendingWorkId, setPendingWorkId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inflightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setColumns(initialColumns)
  }, [initialColumns])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const beginWorkOp = (workId: string) => {
    if (inflightRef.current.has(workId)) return false
    inflightRef.current.add(workId)
    setPendingWorkId(workId)
    return true
  }

  const endWorkOp = (workId: string) => {
    inflightRef.current.delete(workId)
    setPendingWorkId((current) => (current === workId ? null : current))
  }

  const applyDeadlineLocally = (workId: string, deadline: string | null) => {
    setColumns((prev) =>
      prev.map((column) => {
        const works = sortBoardWorksByDeadline(
          column.works.map((work) =>
            work.id === workId
              ? { ...work, deadline, isOverdue: computeIsOverdue(deadline, work.status) }
              : work
          )
        )
        return { ...column, works, count: works.length }
      })
    )
  }

  const persistStatus = (work: BoardWorkCard, nextStatus: WorkStatus) => {
    if (!canEdit || isPending) return
    if (work.status === nextStatus) return
    if (!beginWorkOp(work.id)) return

    const previous = columns
    setColumns((prev) => applyStatusOnStatusBoard(prev, work.id, nextStatus))

    startTransition(async () => {
      try {
        await moveWorkStatusOnBoard({ workId: work.id, status: nextStatus })
        if (nextStatus === 'DONE') {
          showToast('Lavoro completato e archiviato', 'success')
        } else {
          showToast('Stato aggiornato', 'success')
        }
        router.refresh()
      } catch (error) {
        setColumns(previous)
        showToast(error instanceof Error ? error.message : 'Aggiornamento stato non riuscito', 'error')
      } finally {
        endWorkOp(work.id)
      }
    })
  }

  const handleConfirmDelete = () => {
    const work = deleteTarget
    if (!work || !canEdit) return
    if (!beginWorkOp(work.id)) return

    const previous = columns
    setColumns((prev) => removeWorkFromStatusBoard(prev, work.id))
    setDeleteTarget(null)

    startTransition(async () => {
      try {
        await deleteWork(work.id)
        showToast('Lavoro eliminato', 'success')
        router.refresh()
      } catch (error) {
        setColumns(previous)
        showToast(error instanceof Error ? error.message : 'Eliminazione non riuscita', 'error')
      } finally {
        endWorkOp(work.id)
      }
    })
  }

  const onDragStart = (event: DragStartEvent) => {
    const work = event.active.data.current?.work as BoardWorkCard | undefined
    setActiveWork(work ?? null)
  }

  const onDragEnd = (event: DragEndEvent) => {
    setActiveWork(null)
    setOverStatus(null)
    if (!canEdit || isPending) return

    const overId = event.over?.id ? String(event.over.id) : null
    const work = event.active.data.current?.work as BoardWorkCard | undefined
    const fromStatus = event.active.data.current?.columnId as WorkStatus | undefined
    const workId = (event.active.data.current?.workId as string | undefined) ?? work?.id
    if (!overId || !work || !workId) return

    const nextStatus = isArchiveDropId(overId)
      ? 'DONE'
      : isQuickBoardStatus(overId)
        ? overId
        : null
    if (!nextStatus) return
    if (fromStatus === nextStatus) return

    persistStatus(work, nextStatus)
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={(event) => setOverStatus(event.over ? String(event.over.id) : null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveWork(null)
          setOverStatus(null)
        }}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((column) => (
            <StatusColumnView
              key={column.status}
              column={column}
              canEdit={canEdit}
              returnTo={returnTo}
              isOver={overStatus === column.status}
              pendingWorkId={pendingWorkId}
              onReschedule={setRescheduleWork}
              onArchive={(w) => persistStatus(w, 'DONE')}
              onDelete={setDeleteTarget}
              onStatusChange={persistStatus}
            />
          ))}
        </div>

        {canEdit ? <DoneArchiveDropzone isOver={overStatus === WORKS_DONE_DROP_ID} /> : null}

        <DragOverlay dropAnimation={{ duration: 280, easing: BOARD_EASE }}>
          {activeWork ? (
            <div className="w-[260px]">
              <WorkBoardCardContent work={activeWork} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <WorkRescheduleDialog
        work={rescheduleWork}
        open={!!rescheduleWork}
        onOpenChange={(open) => {
          if (!open) setRescheduleWork(null)
        }}
        onSaved={(workId, deadline) => {
          applyDeadlineLocally(workId, deadline)
          router.refresh()
        }}
      />

      <WorkDeleteDialog
        work={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        onConfirm={handleConfirmDelete}
        isPending={!!deleteTarget && pendingWorkId === deleteTarget.id}
      />
    </>
  )
}
