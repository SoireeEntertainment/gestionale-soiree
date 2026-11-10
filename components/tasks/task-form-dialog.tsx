'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { BriefcaseBusiness, Plus } from 'lucide-react'
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
  sanitizeNextReactivateForForm,
  type DailyTaskDTO,
  type DailyTaskType,
} from '@/lib/daily-tasks'
import { todayDateOnlyRome } from '@/lib/timeline-dates'
import { getWorkStatusMeta } from '@/lib/work-status'
import { TaskDateInput } from '@/components/tasks/task-date-input'
import { DeleteTaskConfirmDialog } from '@/components/tasks/delete-task-confirm-dialog'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type ClientOption = { id: string; name: string }

function formatLinkedDeadline(ymd: string | null): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

export function TaskFormDialog({
  open,
  onOpenChange,
  clients,
  mode = 'GENERAL',
  editTask = null,
  onSaved,
  onDeleted,
  defaultClientId,
  canCreateWork = false,
  onCreateWork,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: ClientOption[]
  mode?: DailyTaskType
  editTask?: DailyTaskDTO | null
  onSaved?: (task: DailyTaskDTO) => void
  onDeleted?: (task: DailyTaskDTO) => void | Promise<void>
  defaultClientId?: string
  /** Solo ADMIN (stessi permessi di createWork). */
  canCreateWork?: boolean
  onCreateWork?: (task: DailyTaskDTO) => void
}) {
  const isContact = (editTask?.type ?? mode) === 'CONTACT_CLIENT'
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(todayDateOnlyRome())
  const [clientId, setClientId] = useState('')
  const [notes, setNotes] = useState('')
  const [nextReactivateAt, setNextReactivateAt] = useState(defaultNextReactivateDate())
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    if (editTask) {
      setTitle(editTask.title)
      setDueDate(editTask.dueDate)
      setClientId(editTask.clientId ?? '')
      setNotes(editTask.notes ?? '')
      setNextReactivateAt(
        sanitizeNextReactivateForForm({
          lastContactedAt: editTask.lastContactedAt,
          nextReactivateAt: editTask.nextReactivateAt,
        })
      )
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

  const clientLockedByWork = Boolean(editTask?.linkedWork)
  const showWorkSection = Boolean(editTask && (editTask.clientId || clientId))
  const effectiveClientId = editTask?.clientId || clientId
  const canShowCreateWork =
    Boolean(editTask) &&
    canCreateWork &&
    Boolean(effectiveClientId) &&
    !editTask?.linkedWork &&
    Boolean(onCreateWork)

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

  const linked = editTask?.linkedWork
  const linkedStatusLabel = linked ? getWorkStatusMeta(linked.status).label : ''

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
              disabled={clientLockedByWork}
              className="min-h-[44px] w-full rounded-md border border-accent/20 bg-[#101317] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-70"
            >
              <option value="">{isContact ? 'Seleziona cliente…' : 'Nessuno'}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {clientLockedByWork ? (
              <p className="mt-1 text-[11px] text-white/40">
                Cliente bloccato: esiste un Lavoro collegato.
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              {isContact ? 'Giorno in cui va sentito *' : 'Data scadenza *'}
            </label>
            <TaskDateInput value={dueDate} onChange={setDueDate} />
          </div>

          {isContact && (
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

          {showWorkSection ? (
            <div className="rounded-xl border border-accent/20 bg-accent/[0.04] p-3">
              <p className="text-sm font-semibold text-accent">Lavoro collegato</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/50">
                Puoi creare un lavoro operativo partendo da questa Task, mantenendo il collegamento
                tra le due attività.
              </p>
              {linked ? (
                <div className="mt-3 space-y-1.5 text-xs text-white/80">
                  <p className="font-medium text-white">{linked.title}</p>
                  <p>
                    Stato: <span className="text-white/70">{linkedStatusLabel}</span>
                  </p>
                  <p>
                    Scadenza:{' '}
                    <span className="text-white/70">{formatLinkedDeadline(linked.deadline)}</span>
                  </p>
                  {linked.assigneeNames.length > 0 ? (
                    <p>
                      Assegnatari:{' '}
                      <span className="text-white/70">{linked.assigneeNames.join(', ')}</span>
                    </p>
                  ) : null}
                  <Link
                    href={`/works/${linked.id}`}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/15"
                  >
                    <BriefcaseBusiness className="h-3.5 w-3.5" />
                    Apri lavoro
                  </Link>
                </div>
              ) : canShowCreateWork ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 w-full sm:w-auto"
                  disabled={isPending || isDeleting}
                  onClick={() => {
                    if (!editTask || !onCreateWork) return
                    // Usa i valori correnti del form (anche se non salvati) per prefill titolo/note
                    onCreateWork({
                      ...editTask,
                      title: isContact && selectedClientName ? `Sentire ${selectedClientName}` : title.trim() || editTask.title,
                      notes: notes.trim() || null,
                      clientId: effectiveClientId,
                      clientName: selectedClientName || editTask.clientName,
                      dueDate,
                    })
                  }}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Crea lavoro da questa Task
                </Button>
              ) : !canCreateWork && editTask && effectiveClientId ? (
                <p className="mt-2 text-[11px] text-white/40">
                  Non hai i permessi per creare Lavori.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {editTask && onDeleted ? (
            <Button
              type="button"
              variant="ghost"
              className="justify-start text-red-300/80 hover:bg-red-500/10 hover:text-red-200"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={isPending || isDeleting}
            >
              Elimina task
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isPending || isDeleting}
            >
              Annulla
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={
                isPending ||
                isDeleting ||
                (!isContact && !title.trim()) ||
                !dueDate ||
                (isContact && !clientId)
              }
            >
              {isPending ? 'Salvataggio…' : 'Salva'}
            </Button>
          </div>
        </div>
      </DialogContent>

      <DeleteTaskConfirmDialog
        task={editTask}
        open={confirmDeleteOpen}
        onOpenChange={(next) => {
          if (!next && !isDeleting) setConfirmDeleteOpen(false)
        }}
        isPending={isDeleting}
        onConfirm={() => {
          if (!editTask || !onDeleted) return
          startDeleteTransition(async () => {
            try {
              await onDeleted(editTask)
              setConfirmDeleteOpen(false)
              onOpenChange(false)
            } catch {
              // toast/rollback gestiti dal parent
            }
          })
        }}
      />
    </Dialog>
  )
}
