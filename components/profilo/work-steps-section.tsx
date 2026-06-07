'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getWorkSteps, toggleWorkStep, createWorkStep, deleteWorkStep } from '@/app/actions/work-steps'
import { calculateWorkStepProgress } from '@/lib/work-step-progress'

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
  const router = useRouter()
  const [steps, setSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')

  useEffect(() => {
    getWorkSteps(workId).then((s) => {
      setSteps(s as Step[])
      setLoading(false)
    })
  }, [workId])

  const handleToggle = async (stepId: string) => {
    if (!canWrite) return
    await toggleWorkStep(stepId)
    const updated = await getWorkSteps(workId)
    setSteps(updated as Step[])
    router.refresh()
  }

  const handleAddStep = async () => {
    if (!newTitle.trim() || !canWrite) return
    await createWorkStep(workId, newTitle.trim())
    setNewTitle('')
    const updated = await getWorkSteps(workId)
    setSteps(updated as Step[])
    router.refresh()
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
                    className={`w-5 h-5 rounded border-2 shrink-0 ${
                      step.status === 'DONE'
                        ? 'bg-accent border-accent'
                        : 'border-white/40 hover:border-accent'
                    }`}
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
                <span
                  className={
                    step.status === 'DONE'
                      ? 'text-white/50 line-through'
                      : 'text-white'
                  }
                >
                  {step.title}
                  {step.status === 'DONE' && step.completedBy && (
                    <span className="text-xs text-white/40 ml-2 no-underline">
                      ({step.completedBy.name})
                    </span>
                  )}
                </span>
              </div>
            ))}
            {canWrite && (
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
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