'use client'

import { useEffect, useState, useTransition } from 'react'
import type { BoardWorkCard } from '@/lib/works-board'
import { rescheduleWorkDeadline } from '@/app/actions/works-board'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { showToast } from '@/lib/toast'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'

function formatDisplayDate(deadline: string | null): string {
  if (!deadline) return 'Nessuna'
  try {
    return format(parseISO(deadline), 'dd/MM/yyyy', { locale: it })
  } catch {
    return deadline
  }
}

export function WorkRescheduleDialog({
  work,
  open,
  onOpenChange,
  onSaved,
}: {
  work: BoardWorkCard | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (workId: string, deadline: string | null) => void
}) {
  const [deadline, setDeadline] = useState('')
  const [note, setNote] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open || !work) return
    setDeadline(work.deadline ?? '')
    setNote('')
  }, [open, work])

  const handleSave = () => {
    if (!work) return
    const next = deadline.trim() ? deadline.trim() : null
    startTransition(async () => {
      try {
        const result = await rescheduleWorkDeadline({
          workId: work.id,
          deadline: next,
          note: note.trim() || null,
        })
        onSaved?.(work.id, next)
        onOpenChange(false)
        showToast(
          result.changed ? 'Scadenza aggiornata' : 'Nessuna modifica alla scadenza',
          'success'
        )
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Riprogrammazione non riuscita', 'error')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-accent/20 bg-dark text-white sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Riprogramma consegna</DialogTitle>
          <DialogDescription className="text-white/55">
            Aggiorna la data di consegna. Lo storico scadenze viene registrato automaticamente.
          </DialogDescription>
        </DialogHeader>

        {work ? (
          <div className="space-y-4 py-1">
            <div>
              <p className="text-sm font-semibold text-white">{work.title}</p>
              <p className="text-xs text-white/50">{work.clientName}</p>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-white/45">Data di consegna attuale</p>
              <p className="mt-0.5 font-medium text-white">{formatDisplayDate(work.deadline)}</p>
            </div>

            <div>
              <label htmlFor="reschedule-deadline" className="mb-1.5 block text-sm font-medium text-white">
                Nuova data di consegna
              </label>
              <input
                id="reschedule-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-accent/20 bg-[#101317] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                className="mt-1.5 text-xs text-white/45 underline-offset-2 hover:text-white/70 hover:underline"
                onClick={() => setDeadline('')}
              >
                Rimuovi scadenza
              </button>
            </div>

            <div>
              <label htmlFor="reschedule-note" className="mb-1.5 block text-sm font-medium text-white">
                Motivazione <span className="font-normal text-white/40">(opzionale)</span>
              </label>
              <textarea
                id="reschedule-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Motivo della riprogrammazione…"
                className="w-full resize-none rounded-md border border-accent/20 bg-[#101317] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>
        ) : null}

        <div
          className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isPending}>
            Annulla
          </Button>
          <Button type="button" onClick={handleSave} disabled={isPending || !work}>
            {isPending ? 'Salvataggio…' : 'Salva nuova data'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
