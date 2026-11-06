'use client'

import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { Phone } from 'lucide-react'
import {
  BOARD_EASE,
  getTaskDueUrgency,
  type DailyTaskDTO,
  type TaskDueUrgency,
} from '@/lib/daily-tasks'
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
  compact = false,
}: {
  tasks: DailyTaskDTO[]
  onToggle: (task: DailyTaskDTO) => void
  onEdit?: (task: DailyTaskDTO) => void
  compact?: boolean
}) {
  if (tasks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-white/40">
        Nessuna task. Creane una con i pulsanti sopra.
      </p>
    )
  }

  return (
    <ul className={cn('space-y-2', compact && 'space-y-1.5')}>
      {tasks.map((task) => {
        const urgency = getTaskDueUrgency(task.dueDate)
        const done = task.status === 'DONE'
        return (
          <li
            key={task.id}
            className={cn(
              'group flex items-start gap-3 rounded-xl border border-accent/15 bg-[#14171c] px-3 py-2.5',
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
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2',
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
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
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
          </li>
        )
      })}
    </ul>
  )
}
