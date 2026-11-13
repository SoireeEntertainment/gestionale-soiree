'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
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
import { Archive } from 'lucide-react'
import type { BoardWorkCard } from '@/lib/works-board'
import { BOARD_EASE, computeIsOverdue, sortBoardWorksByDeadline } from '@/lib/works-board'
import type { WorkStatus } from '@/lib/work-status'
import {
  WORKS_PERSON_BOARD_ARCHIVE_DROP_ID,
  applyStatusOnPersonBoard,
  archiveWorkOnPersonBoard,
  isArchiveDropId,
  removeWorkFromPersonBoard,
} from '@/lib/work-board-quick-actions'
import type { WorksBoardColumn, WorksBoardData } from '@/app/actions/works-board'
import { moveWorkStatusOnBoard, reassignWorkOnBoard } from '@/app/actions/works-board'
import { deleteWork } from '@/app/actions/works'
import { DraggableWorkBoardCard, WorkBoardCardContent } from '@/components/works/work-board-card'
import { WorkRescheduleDialog } from '@/components/works/work-reschedule-dialog'
import { WorkDeleteDialog } from '@/components/works/work-delete-dialog'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

function PersonColumn({
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
  column: WorksBoardColumn
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
    id: column.userId,
    data: { type: 'person-column', userId: column.userId },
  })

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex min-h-[420px] flex-col rounded-2xl border bg-[#101317]/90',
        'transition-[border-color,background-color,box-shadow] duration-300',
        isOver ? 'border-accent/55 bg-accent/5 shadow-lg shadow-accent/10' : 'border-accent/15'
      )}
      style={{ transitionTimingFunction: BOARD_EASE }}
    >
      <Link
        href={`/works/person/${column.userId}`}
        className="sticky top-0 z-10 rounded-t-2xl border-b border-accent/10 bg-[#101317]/95 px-4 py-3 backdrop-blur-sm hover:bg-white/[0.03]"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white">{column.label}</h2>
            <p className="text-xs text-white/45 truncate">{column.name}</p>
          </div>
          <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
            {column.count}
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {column.works.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/35">Nessun lavoro assegnato</p>
        ) : (
          column.works.map((work) => (
            <DraggableWorkBoardCard
              key={`${column.userId}-${work.id}`}
              work={work}
              columnId={column.userId}
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

function PersonArchiveDropzone({ visible, isOver }: { visible: boolean; isOver: boolean }) {
  const { setNodeRef } = useDroppable({
    id: WORKS_PERSON_BOARD_ARCHIVE_DROP_ID,
    data: { type: 'archive', status: 'DONE' },
  })

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'sticky bottom-20 z-20 mt-3 flex items-center justify-center gap-3 rounded-2xl border border-dashed px-4 md:bottom-4',
        'transition-[border-color,background-color,box-shadow,opacity,transform,min-height,padding] duration-300',
        visible
          ? 'min-h-[76px] py-4 opacity-100'
          : 'pointer-events-none min-h-0 overflow-hidden border-transparent bg-transparent py-0 opacity-0',
        visible &&
          (isOver
            ? 'border-emerald-400/70 bg-emerald-500/15 shadow-lg shadow-emerald-500/15 scale-[1.01]'
            : 'border-emerald-500/30 bg-emerald-500/[0.06]')
      )}
      style={{ transitionTimingFunction: BOARD_EASE }}
      aria-hidden={!visible}
      aria-label="Fatto — Archivia"
    >
      <Archive className={cn('h-5 w-5', isOver ? 'text-emerald-200' : 'text-emerald-400/80')} aria-hidden />
      <div className="text-center">
        <p className={cn('text-sm font-semibold', isOver ? 'text-emerald-100' : 'text-emerald-300/90')}>
          Fatto — Archivia
        </p>
        <p className="text-[11px] text-white/45">Rilascia qui per completare il lavoro</p>
      </div>
    </section>
  )
}

export function WorksPersonBoard({
  initialData,
  canEdit,
  returnTo = '/works',
  onCountsChange,
}: {
  initialData: WorksBoardData
  canEdit: boolean
  returnTo?: string
  onCountsChange?: (counts: { activeCount: number; archiveCount: number }) => void
}) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [activeWork, setActiveWork] = useState<BoardWorkCard | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [rescheduleWork, setRescheduleWork] = useState<BoardWorkCard | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BoardWorkCard | null>(null)
  const [pendingWorkId, setPendingWorkId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inflightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setData(initialData)
  }, [initialData])

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

  const commitData = (
    previous: WorksBoardData,
    next: WorksBoardData,
    apply: (prev: WorksBoardData) => WorksBoardData
  ) => {
    setData(apply)
    onCountsChange?.({ activeCount: next.activeCount, archiveCount: next.archiveCount })
    return previous
  }

  const applyDeadlineLocally = (workId: string, deadline: string | null) => {
    setData((prev) => {
      const patch = (work: BoardWorkCard): BoardWorkCard =>
        work.id === workId
          ? { ...work, deadline, isOverdue: computeIsOverdue(deadline, work.status) }
          : work
      return {
        ...prev,
        columns: prev.columns.map((column) => {
          const works = sortBoardWorksByDeadline(column.works.map(patch))
          return { ...column, works, count: works.length }
        }),
        unassigned: sortBoardWorksByDeadline(prev.unassigned.map(patch)),
      }
    })
  }

  const handleStatusChange = (work: BoardWorkCard, nextStatus: WorkStatus) => {
    if (!canEdit || isPending) return
    if (work.status === nextStatus) return
    if (!beginWorkOp(work.id)) return

    const previous = data
    const next = applyStatusOnPersonBoard(data, work.id, nextStatus)
    commitData(previous, next, () => next)

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
        setData(previous)
        onCountsChange?.({
          activeCount: previous.activeCount,
          archiveCount: previous.archiveCount,
        })
        showToast(error instanceof Error ? error.message : 'Aggiornamento stato non riuscito', 'error')
      } finally {
        endWorkOp(work.id)
      }
    })
  }

  const handleArchive = (work: BoardWorkCard) => {
    handleStatusChange(work, 'DONE')
  }

  const handleConfirmDelete = () => {
    const work = deleteTarget
    if (!work || !canEdit) return
    if (!beginWorkOp(work.id)) return

    const previous = data
    const next = removeWorkFromPersonBoard(data, work.id)
    commitData(previous, next, () => next)
    setDeleteTarget(null)

    startTransition(async () => {
      try {
        await deleteWork(work.id)
        showToast('Lavoro eliminato', 'success')
        router.refresh()
      } catch (error) {
        setData(previous)
        onCountsChange?.({
          activeCount: previous.activeCount,
          archiveCount: previous.archiveCount,
        })
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

  const onDragOver = (event: { over: { id: string | number } | null }) => {
    setOverId(event.over ? String(event.over.id) : null)
  }

  const onDragEnd = (event: DragEndEvent) => {
    setActiveWork(null)
    setOverId(null)
    if (!canEdit || isPending) return

    const overDropId = event.over?.id ? String(event.over.id) : null
    const work = event.active.data.current?.work as BoardWorkCard | undefined
    const fromUserId = event.active.data.current?.columnId as string | undefined
    const workId = (event.active.data.current?.workId as string | undefined) ?? work?.id
    if (!overDropId || !work || !workId) return

    if (isArchiveDropId(overDropId)) {
      if (work.status === 'DONE') return
      if (!beginWorkOp(workId)) return
      const previous = data
      const next = archiveWorkOnPersonBoard(data, workId)
      commitData(previous, next, () => next)
      startTransition(async () => {
        try {
          await moveWorkStatusOnBoard({ workId, status: 'DONE' })
          showToast('Lavoro completato e archiviato', 'success')
          router.refresh()
        } catch (error) {
          setData(previous)
          onCountsChange?.({
            activeCount: previous.activeCount,
            archiveCount: previous.archiveCount,
          })
          showToast(error instanceof Error ? error.message : 'Archiviazione non riuscita', 'error')
        } finally {
          endWorkOp(workId)
        }
      })
      return
    }

    const targetColumn = data.columns.find((c) => c.userId === overDropId)
    if (!targetColumn) return
    if (fromUserId === targetColumn.userId) return
    if (!fromUserId) return
    if (!beginWorkOp(workId)) return

    const previous = data
    const nextAssigneeIds = [
      ...new Set(
        [...work.assigneeUserIds.filter((id) => id !== fromUserId), targetColumn.userId].filter(Boolean)
      ),
    ]
    const moved: BoardWorkCard = {
      ...work,
      assignedToUserId:
        work.assignedToUserId === fromUserId || !work.assignedToUserId
          ? targetColumn.userId
          : work.assignedToUserId,
      assigneeUserIds: nextAssigneeIds,
    }

    setData((prev) => {
      const columns = prev.columns.map((column) => {
        let works = column.works.map((item) => (item.id === workId ? moved : item))
        if (column.userId === fromUserId) {
          works = works.filter((item) => item.id !== workId)
        } else if (column.userId === targetColumn.userId) {
          if (!works.some((item) => item.id === workId)) {
            works = sortBoardWorksByDeadline([...works, moved])
          } else {
            works = sortBoardWorksByDeadline(works)
          }
        } else {
          works = sortBoardWorksByDeadline(works)
        }
        return { ...column, works, count: works.length }
      })
      return {
        ...prev,
        columns,
        unassigned: prev.unassigned.filter((w) => w.id !== workId),
      }
    })

    startTransition(async () => {
      try {
        await reassignWorkOnBoard({
          workId,
          fromUserId,
          toUserId: targetColumn.userId,
        })
        router.refresh()
      } catch (error) {
        setData(previous)
        showToast(error instanceof Error ? error.message : 'Spostamento non riuscito', 'error')
      } finally {
        endWorkOp(workId)
      }
    })
  }

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveWork(null)
          setOverId(null)
        }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.columns.map((column) => (
            <PersonColumn
              key={column.userId}
              column={column}
              canEdit={canEdit}
              returnTo={returnTo}
              isOver={overId === column.userId}
              pendingWorkId={pendingWorkId}
              onReschedule={setRescheduleWork}
              onArchive={handleArchive}
              onDelete={setDeleteTarget}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>

        {canEdit ? (
          <PersonArchiveDropzone
            visible={!!activeWork}
            isOver={isArchiveDropId(overId)}
          />
        ) : null}

        <DragOverlay dropAnimation={{ duration: 280, easing: BOARD_EASE }}>
          {activeWork ? <WorkBoardCardContent work={activeWork} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {data.unassigned.length > 0 && (
        <section className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4">
          <h3 className="mb-3 text-sm font-medium text-white/70">
            Non assegnati al team ({data.unassigned.length})
          </h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {data.unassigned.map((work) => (
              <WorkBoardCardContent
                key={work.id}
                work={work}
                href={`/works/${work.id}?returnTo=${encodeURIComponent(returnTo)}`}
                pending={pendingWorkId === work.id}
                onReschedule={canEdit ? setRescheduleWork : undefined}
                onArchive={canEdit ? handleArchive : undefined}
                onDelete={canEdit ? setDeleteTarget : undefined}
                onStatusChange={canEdit ? handleStatusChange : undefined}
              />
            ))}
          </div>
        </section>
      )}

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
    </div>
  )
}
