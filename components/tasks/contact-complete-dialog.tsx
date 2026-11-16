'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { completeDailyTask } from '@/app/actions/daily-tasks'
import {
  defaultNextReactivateDate,
  quickReactivateDate,
  type DailyTaskDTO,
} from '@/lib/daily-tasks'
import { todayDateOnlyRome } from '@/lib/timeline-dates'
import { TaskDateInput } from '@/components/tasks/task-date-input'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

export function ContactCompleteDialog({
  task,
  open,
  onOpenChange,
  onCompleted,
}: {
  task: DailyTaskDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted?: (task: DailyTaskDTO) => void
}) {
  /** YYYY-MM-DD oppure '' = NESSUNA DATA (salvato come null). */
  const [nextReactivateAt, setNextReactivateAt] = useState(defaultNextReactivateDate())
  const [isPending, startTransition] = useTransition()
  const contactAnchor = todayDateOnlyRome()
  const noReactivateSelected = nextReactivateAt === ''

  useEffect(() => {
    if (!open || !task) return
    // Default sempre +7 dal contatto odierno (non riusare la nextReactivate precedente).
    setNextReactivateAt(defaultNextReactivateDate(todayDateOnlyRome()))
  }, [open, task])

  const handleConfirm = () => {
    if (!task) return
    startTransition(async () => {
      try {
        const saved = await completeDailyTask({
          id: task.id,
          nextReactivateAt: nextReactivateAt.trim() || null,
        })
        showToast('Cliente segnato come sentito', 'success')
        onCompleted?.(saved)
        onOpenChange(false)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Completamento non riuscito', 'error')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-accent/20 bg-dark text-white sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Cliente sentito</DialogTitle>
          <DialogDescription className="text-white/55">
            Conferma il contatto e scegli quando riattivare il promemoria.
          </DialogDescription>
        </DialogHeader>

        {task ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-white">
              {task.clientName ?? task.title}
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white">
                Prossima riattivazione
              </label>
              <TaskDateInput value={nextReactivateAt} onChange={setNextReactivateAt} />
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ['tomorrow', 'DOMANI'],
                    ['next_week', 'SETTIMANA PROSSIMA'],
                    ['next_month', 'MESE PROSSIMO'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setNextReactivateAt(quickReactivateDate(key, contactAnchor))}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors',
                      nextReactivateAt === quickReactivateDate(key, contactAnchor)
                        ? 'border-accent/50 bg-accent/15 text-accent'
                        : 'border-white/15 text-white/60 hover:border-accent/30 hover:text-white'
                    )}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setNextReactivateAt('')}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors',
                    noReactivateSelected
                      ? 'border-red-400/60 bg-red-500/15 text-red-200'
                      : 'border-red-400/30 text-red-300/80 hover:border-red-400/50 hover:text-red-200'
                  )}
                >
                  NESSUNA DATA
                </button>
              </div>
              {noReactivateSelected ? (
                <p className="mt-2 text-[11px] text-white/45">
                  Il cliente non verrà riattivato automaticamente.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isPending}>
            Annulla
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isPending || !task}>
            {isPending ? 'Salvataggio…' : 'Conferma'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
