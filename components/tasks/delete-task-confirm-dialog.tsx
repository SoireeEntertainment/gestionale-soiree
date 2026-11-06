'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { DailyTaskDTO } from '@/lib/daily-tasks'

export function DeleteTaskConfirmDialog({
  task,
  open,
  onOpenChange,
  onConfirm,
  isPending = false,
}: {
  task: DailyTaskDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending?: boolean
}) {
  const isContact = task?.type === 'CONTACT_CLIENT'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-accent/20 bg-dark text-white sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Eliminare questa task?</DialogTitle>
          <DialogDescription className="text-white/55 space-y-2">
            {task ? (
              <span className="block font-medium text-white/80">{task.title}</span>
            ) : null}
            <span className="block">
              {isContact
                ? 'Eliminando questa task verrà rimosso anche il monitoraggio del cliente dall’Universo. Il cliente resterà presente nel gestionale. I dati di contatto (ultimo contatto e prossima riattivazione) contenuti in questa task non saranno più disponibili.'
                : 'Questa task verrà eliminata definitivamente.'}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Annulla
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={isPending || !task}>
            {isPending ? 'Eliminazione…' : 'Elimina task'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
