'use client'

import { useState, useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { Phone, Trash2 } from 'lucide-react'
import {
  BOARD_EASE,
  getTaskDueUrgency,
  type DailyTaskDTO,
  type TaskDueUrgency,
} from '@/lib/daily-tasks'
import { DeleteTaskConfirmDialog } from '@/components/tasks/delete-task-confirm-dialog'
import { cn } from '@/lib/utils'

function formatDue(dueDate: string): string {
  try {
    return format(parseISO(dueDate), 'dd MMM yyyy', { locale: it })
  } catch {
    return dueDate
  }
}

function urgencyClass(urgency: TaskDueUrgency): string {
  switch (urgency) {
    case 'overdue':
      return 'text-red-300'
    case 'today':
      return 'text-rose-300'
    case 'soon':
      return 'text-amber-200'
    default:
      return 'text-white/55'
  }
}

export function TasksList({
  tasks,
  onToggle,
  onEdit,
  onDelete,
  compact = false,
}: {
  tasks: DailyTaskDTO[]
  onToggle: (task: DailyTaskDTO) => void
  onEdit?: (task: DailyTaskDTO) => void
  /** Chiamata solo dopo conferma nel dialog. */
  onDelete?: (task: DailyTaskDTO) => void | Promise<void>
  compact?: boolean
}) {
  const [pendingDelete, setPendingDelete] = useState<DailyTaskDTO | null>(null)
  const [isDeleting, startDeleteTransition] = useTransition()

  if (tasks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-white/40">
        Nessuna task. Creane una con i pulsanti sopra.
      </p>
    )
  }

  const confirmDelete = () => {
    if (!pendingDelete || !onDelete) return
    const task = pendingDelete
    startDeleteTransition(async () => {
      try {
        await onDelete(task)
        setPendingDelete(null)
      } catch {
        // Il parent gestisce toast/rollback; il dialog resta aperto se l’errore non chiude.
      }
    })
  }

  return (
    <>
      <ul className={cn('space-y-2', compact && 'space-y-1.5')}>
        {tasks.map((task) => {
          const urgency = getTaskDueUrgency(task.dueDate)
          const done = task.status === 'DONE'
          return (
            <li
              key={task.id}
              className={cn(
                'group flex items-center gap-2 rounded-xl border border-accent/15 bg-[#14171c] px-3 py-2',
                'transition-[border-color,background-color] duration-250',
                done && 'opacity-60',
                !done && urgency === 'overdue' && 'border-red-500/30'
              )}
              style={{ transitionTimingFunction: BOARD_EASE }}
            >
              <button
                type="button"
                aria-label={done ? 'Riapri task' : 'Completa task'}
                onClick={() => onToggle(task)}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2',
                  done
                    ? 'border-accent bg-accent text-dark'
                    : 'border-white/35 hover:border-accent'
                )}
              >
                {done ? <span className="text-[10px] font-bold">✓</span> : null}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit?.(task)}
                    className={cn(
                      'text-left text-sm font-medium text-white hover:text-accent',
                      done && 'line-through text-white/50'
                    )}
                  >
                    {task.title}
                  </button>
                  {task.type === 'CONTACT_CLIENT' && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-200">
                      <Phone className="h-3 w-3" aria-hidden />
                      Sentire
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className={cn('font-medium', urgencyClass(urgency))}>
                    {formatDue(task.dueDate)}
                    {urgency === 'overdue' && !done ? ' · scaduta' : ''}
                    {urgency === 'today' && !done ? ' · oggi' : ''}
                  </span>
                  {task.clientName ? (
                    <span className="text-white/40 truncate">{task.clientName}</span>
                  ) : null}
                </div>
              </div>

              {onDelete ? (
                <button
                  type="button"
                  title="Elimina task"
                  aria-label="Elimina task"
                  onClick={() => setPendingDelete(task)}
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-md',
                    'text-red-300/70 hover:bg-red-500/10 hover:text-red-300',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50'
                  )}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>

      <DeleteTaskConfirmDialog
        task={pendingDelete}
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDelete(null)
        }}
        onConfirm={confirmDelete}
        isPending={isDeleting}
      />
    </>
  )
}
