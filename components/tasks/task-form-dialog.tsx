'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createDailyTask, updateDailyTask } from '@/app/actions/daily-tasks'
import {
  defaultNextReactivateDate,
  quickReactivateDate,
  type DailyTaskDTO,
  type DailyTaskType,
} from '@/lib/daily-tasks'
import { todayDateOnlyRome } from '@/lib/timeline-dates'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type ClientOption = { id: string; name: string }

export function TaskFormDialog({
  open,
  onOpenChange,
  clients,
  mode = 'GENERAL',
  editTask = null,
  onSaved,
  defaultClientId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: ClientOption[]
  mode?: DailyTaskType
  editTask?: DailyTaskDTO | null
  onSaved?: (task: DailyTaskDTO) => void
  defaultClientId?: string
}) {
  const isContact = (editTask?.type ?? mode) === 'CONTACT_CLIENT'
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(todayDateOnlyRome())
  const [clientId, setClientId] = useState('')
  const [notes, setNotes] = useState('')
  const [nextReactivateAt, setNextReactivateAt] = useState(defaultNextReactivateDate())
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    if (editTask) {
      setTitle(editTask.title)
      setDueDate(editTask.dueDate)
      setClientId(editTask.clientId ?? '')
      setNotes(editTask.notes ?? '')
      setNextReactivateAt(editTask.nextReactivateAt ?? defaultNextReactivateDate(editTask.dueDate))
      return
    }
    setTitle(isContact ? 'Sentire cliente' : '')
    setDueDate(todayDateOnlyRome())
    setClientId(defaultClientId ?? '')
    setNotes('')
    setNextReactivateAt(defaultNextReactivateDate())
  }, [open, editTask, isContact, defaultClientId])

  const selectedClientName = useMemo(
    () => clients.find((c) => c.id === clientId)?.name ?? '',
    [clients, clientId]
  )

  const handleSubmit = () => {
    startTransition(async () => {
      try {
        let saved: DailyTaskDTO
        if (editTask) {
          saved = await updateDailyTask({
            id: editTask.id,
            title: isContact && selectedClientName ? `Sentire ${selectedClientName}` : title.trim(),
            dueDate,
            clientId: clientId || null,
            notes: notes.trim() || null,
            nextReactivateAt: isContact ? nextReactivateAt : null,
          })
        } else {
          saved = await createDailyTask({
            title: isContact ? `Sentire ${selectedClientName || 'cliente'}` : title.trim(),
            type: isContact ? 'CONTACT_CLIENT' : 'GENERAL',
            dueDate,
            clientId: clientId || null,
            notes: notes.trim() || null,
            nextReactivateAt: isContact ? nextReactivateAt : null,
          })
        }
        showToast(editTask ? 'Task aggiornata' : 'Task creata', 'success')
        onSaved?.(saved)
        onOpenChange(false)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Salvataggio non riuscito', 'error')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-accent/20 bg-dark text-white sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {editTask
              ? 'Modifica task'
              : isContact
                ? 'Nuova task: Sentire cliente'
                : 'Nuova task'}
          </DialogTitle>
          <DialogDescription className="text-white/55">
            {isContact
              ? 'Promemoria ciclico per contattare un cliente.'
              : 'Promemoria rapido con data di scadenza.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {!isContact && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white">Titolo *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-accent/20 bg-[#101317] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Es. Preparare brief"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Cliente {isContact ? '*' : '(opzionale)'}
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-accent/20 bg-[#101317] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">{isContact ? 'Seleziona cliente…' : 'Nessuno'}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              {isContact ? 'Giorno in cui va sentito *' : 'Data scadenza *'}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-accent/20 bg-[#101317] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {isContact && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white">
                Prossima riattivazione
              </label>
              <input
                type="date"
                value={nextReactivateAt}
                onChange={(e) => setNextReactivateAt(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-accent/20 bg-[#101317] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent"
              />
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
                    onClick={() => setNextReactivateAt(quickReactivateDate(key, dueDate || todayDateOnlyRome()))}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors',
                      nextReactivateAt === quickReactivateDate(key, dueDate || todayDateOnlyRome())
                        ? 'border-accent/50 bg-accent/15 text-accent'
                        : 'border-white/15 text-white/60 hover:border-accent/30 hover:text-white'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Note <span className="font-normal text-white/40">(opzionale)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-accent/20 bg-[#101317] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Dettagli utili…"
            />
          </div>
        </div>

        <div
          className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isPending}>
            Annulla
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              isPending ||
              (!isContact && !title.trim()) ||
              !dueDate ||
              (isContact && !clientId)
            }
          >
            {isPending ? 'Salvataggio…' : 'Salva'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
