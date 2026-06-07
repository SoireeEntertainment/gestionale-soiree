'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getWorkSteps, toggleWorkStep, createWorkStep, deleteWorkStep } from '@/app/actions/work-steps'
import { calculateWorkStepProgress } from '@/lib/work-step-progress'
import { showToast } from '@/lib/toast'
import { measureAction } from '@/lib/measure-action'

type Step = {
  id: string
  title: string
  status: string
  sortOrder: number
  completedAt: Date | null
  completedBy: { id: string; name: string } | null
}

export function WorkStepsSection({
  workId,
  onClose,
  canWrite,
}: {
  workId: string
  onClose: () => void
  canWrite: boolean
}) {
  const [steps, setSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    getWorkSteps(workId).then((s) => {
      setSteps(s as Step[])
      setLoading(false)
    })
  }, [workId])

  const handleToggle = async (stepId: string) => {
    if (!canWrite || togglingId) return
    const previous = steps
    const step = steps.find((s) => s.id === stepId)
    if (!step) return
    const nextDone = step.status !== 'DONE'
    setTogglingId(stepId)
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? { ...s, status: nextDone ? 'DONE' : 'TODO', completedAt: nextDone ? new Date() : null }
          : s
      )
    )
    try {
      await measureAction('toggleWorkStep', () => toggleWorkStep(stepId))
    } catch {
      setSteps(previous)
      showToast('Errore durante l\'aggiornamento', 'error')
    } finally {
      setTogglingId(null)
    }
  }

  const handleAddStep = async () => {
    if (!newTitle.trim() || !canWrite) return
    const title = newTitle.trim()
    setNewTitle('')
    showToast('Aggiunta step…', 'loading')
    try {
      await measureAction('createWorkStep', () => createWorkStep(workId, title))
      const updated = await getWorkSteps(workId)
      setSteps(updated as Step[])
      showToast('Step aggiunto', 'success')
    } catch {
      setNewTitle(title)
      showToast('Errore durante l\'aggiunta', 'error')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Processo produttivo</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-white/60">Caricamento...</p>
        ) : (
          <div className="space-y-3">
            {steps.length > 0 && (
              <div className="space-y-1">
                <div className="text-sm text-white/70">
                  Avanzamento: {calculateWorkStepProgress(steps).completed}/{calculateWorkStepProgress(steps).total} —{' '}
                  {calculateWorkStepProgress(steps).percent}%
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${calculateWorkStepProgress(steps).percent}%` }}
                  />
                </div>
              </div>
            )}
            {steps.map((step) => (
              <div key={step.id} className="flex items-center gap-3">
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => handleToggle(step.id)}
                    disabled={togglingId === step.id}
                    aria-busy={togglingId === step.id}
                    className={`w-5 h-5 rounded border-2 shrink-0 transition-opacity ${
                      step.status === 'DONE'
                        ? 'bg-accent border-accent'
                        : 'border-white/40 hover:border-accent'
                    } ${togglingId === step.id ? 'opacity-60' : ''}`}
                  >
                    {step.status === 'DONE' && (
                      <span className="text-dark text-xs block leading-none font-bold">✓</span>
                    )}
                  </button>
                ) : (
                  <span
                    className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center text-xs ${
                      step.status === 'DONE' ? 'bg-accent border-accent text-dark' : 'border-white/40'
                    }`}
                  >
                    {step.status === 'DONE' ? '✓' : ''}
                  </span>
                )}
                <span className={step.status === 'DONE' ? 'text-white/50 line-through' : 'text-white'}>
                  {step.title}
                </span>
              </div>
            ))}
            {canWrite && (
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
                  placeholder="Nuovo step..."
                  className="flex-1 px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm"
                />
                <Button size="sm" onClick={handleAddStep}>
                  Aggiungi
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
