'use client'

import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { BoardWorkCard } from '@/lib/works-board'

function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'Senza scadenza'
  try {
    return format(parseISO(deadline), 'dd MMMM yyyy', { locale: it })
  } catch {
    return deadline
  }
}

export function WorkDeleteDialog({
  work,
  open,
  onOpenChange,
  onConfirm,
  isPending = false,
}: {
  work: Pick<BoardWorkCard, 'title' | 'clientName' | 'deadline'> | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending?: boolean
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md border-accent/20 bg-dark text-white sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Eliminare definitivamente questo lavoro?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-white/55">
              {work ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm">
                  <p className="font-medium text-white/90">{work.title}</p>
                  <p className="mt-1 text-white/60">{work.clientName}</p>
                  <p className="mt-1 text-white/50">Scadenza: {formatDeadline(work.deadline)}</p>
                </div>
              ) : null}
              <p>
                Il lavoro verrà eliminato definitivamente e non sarà più disponibile nelle board o
                nell&apos;Archivio. Verranno rimossi anche i dati dipendenti eliminati insieme al
                lavoro (assegnazioni, checklist, commenti e storico consegne). Il cliente e le Task
                collegate resteranno presenti; se il lavoro era nato da una Task, tornerà disponibile
                l&apos;azione per crearne uno nuovo.
              </p>
            </div>
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
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            disabled={isPending || !work}
          >
            {isPending ? 'Eliminazione…' : 'Elimina definitivamente'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
