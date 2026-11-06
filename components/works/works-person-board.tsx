'use client'

import { useEffect, useState, useTransition } from 'react'
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
import type { BoardWorkCard } from '@/lib/works-board'
import { BOARD_EASE, sortBoardWorksByDeadline } from '@/lib/works-board'
import type { WorksBoardColumn, WorksBoardData } from '@/app/actions/works-board'
import { reassignWorkOnBoard } from '@/app/actions/works-board'
import { DraggableWorkBoardCard, WorkBoardCardContent } from '@/components/works/work-board-card'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

function PersonColumn({
  column,
  canEdit,
  returnTo,
  isOver,
}: {
  column: WorksBoardColumn
  canEdit: boolean
  returnTo: string
  isOver: boolean
}) {
  const { setNodeRef } = useDroppable({ id: column.userId, data: { userId: column.userId } })

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
            />
          ))
        )}
      </div>
    </section>
  )
}

export function WorksPersonBoard({
  initialData,
  canEdit,
  returnTo = '/works',
}: {
  initialData: WorksBoardData
  canEdit: boolean
  returnTo?: string
}) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [activeWork, setActiveWork] = useState<BoardWorkCard | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setData(initialData)
  }, [initialData])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  const onDragStart = (event: DragStartEvent) => {
    const work = event.active.data.current?.work as BoardWorkCard | undefined
    setActiveWork(work ?? null)
  }

  const onDragOver = (event: { over: { id: string | number } | null }) => {
    setOverColumnId(event.over ? String(event.over.id) : null)
  }

  const onDragEnd = (event: DragEndEvent) => {
    setActiveWork(null)
    setOverColumnId(null)
    if (!canEdit || isPending) return

    const overId = event.over?.id ? String(event.over.id) : null
    const work = event.active.data.current?.work as BoardWorkCard | undefined
    const fromUserId = event.active.data.current?.columnId as string | undefined
    const workId = (event.active.data.current?.workId as string | undefined) ?? work?.id
    if (!overId || !work || !workId) return

    const targetColumn = data.columns.find((c) => c.userId === overId)
    if (!targetColumn) return
    if (fromUserId === targetColumn.userId) return

    if (!fromUserId) return

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
        }
        return { ...column, works, count: works.length }
      })
      return {
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
          setOverColumnId(null)
        }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.columns.map((column) => (
            <PersonColumn
              key={column.userId}
              column={column}
              canEdit={canEdit}
              returnTo={returnTo}
              isOver={overColumnId === column.userId}
            />
          ))}
        </div>

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
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
