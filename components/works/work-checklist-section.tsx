'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import {
  getWorkSteps,
  toggleWorkStep,
  createWorkStep,
  updateWorkStep,
  deleteWorkStep,
  generateMissingWorkSteps,
  regenerateWorkStepsFromCategory,
} from '@/app/actions/work-steps'
import { updateWorkStatus } from '@/app/actions/works'
import { calculateWorkStepProgress } from '@/lib/work-step-progress'

type Step = {
  id: string
  title: string
  status: string
  sortOrder: number
  completedAt: Date | null
  completedBy: { id: string; name: string } | null
}

interface WorkChecklistSectionProps {
  workId: string
  workStatus: string
  categoryName: string
  canManage: boolean
  canAdmin: boolean
}

export function WorkChecklistSection({
  workId,
  workStatus,
  categoryName,
  canManage,
  canAdmin,
}: WorkChecklistSectionProps) {
  const router = useRouter()
  const [steps, setSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [generating, setGenerating] = useState(false)

  const loadSteps = async () => {
    const s = await getWorkSteps(workId)
    setSteps(s as Step[])
    setLoading(false)
  }

  useEffect(() => {
    loadSteps()
  }, [workId])

  const progress = calculateWorkStepProgress(steps)
  const allCompleted = progress.total > 0 && progress.completed === progress.total

  const handleToggle = async (stepId: string) => {
    if (!canManage) return
    await toggleWorkStep(stepId)
    await loadSteps()
    router.refresh()
  }

  const handleAddStep = async () => {
    if (!newTitle.trim() || !canManage) return
    await createWorkStep(workId, newTitle.trim())
    setNewTitle('')
    await loadSteps()
    router.refresh()
  }

  const handleSaveRename = async (stepId: string) => {
    if (!editTitle.trim() || !canAdmin) return
    await updateWorkStep(stepId, { title: editTitle.trim() })
    setEditingId(null)
    await loadSteps()
    router.refresh()
  }

  const handleDelete = async (stepId: string, title: string) => {
    if (!canAdmin) return
    if (!confirm(`Eliminare lo step "${title}"?`)) return
    await deleteWorkStep(stepId)
    await loadSteps()
    router.refresh()
  }

  const handleGenerate = async () => {
    if (!canAdmin) return
    setGenerating(true)
    try {
      await generateMissingWorkSteps(workId)
      await loadSteps()
      router.refresh()
    } finally {
      setGenerating(false)
    }
  }

  const handleRegenerate = async () => {
    if (!canAdmin) return
    if (
      !confirm(
        'Rigenerare la checklist dalla categoria? Gli step attuali verranno sostituiti e perderai lo stato di completamento.'
      )
    ) {
      return
    }
    setGenerating(true)
    try {
      await regenerateWorkStepsFromCategory(workId)
      await loadSteps()
      router.refresh()
    } finally {
      setGenerating(false)
    }
  }

  const handleMarkWorkDone = async () => {
    if (!canAdmin || workStatus === 'DONE') return
    if (!confirm('Segnare il lavoro come Fatto?')) return
    await updateWorkStatus(workId, 'DONE')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="bg-dark border border-accent/20 rounded-lg p-6">
        <p className="text-white/60">Caricamento checklist...</p>
      </div>
    )
  }

  return (
    <div className="bg-dark border border-accent/20 rounded-lg p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Checklist operativa</h2>
        {canAdmin && steps.length === 0 && (
          <Button size="sm" onClick={handleGenerate} disabled={generating}>
            Genera checklist da categoria
          </Button>
        )}
        {canAdmin && steps.length > 0 && (
          <Button size="sm" variant="secondary" onClick={handleRegenerate} disabled={generating}>
            Rigenera checklist da categoria
          </Button>
        )}
      </div>

      {steps.length === 0 ? (
        <p className="text-white/50 text-sm">
          Nessuno step definito per questo lavoro ({categoryName}).
          {canAdmin && ' Usa il pulsante sopra per generare la checklist predefinita.'}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-white/70">
              <span>
                Avanzamento: {progress.completed}/{progress.total} — {progress.percent}%
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            {steps.map((step) => (
              <div
                key={step.id}
                className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0"
              >
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => handleToggle(step.id)}
                    aria-label={step.status === 'DONE' ? 'Segna come da fare' : 'Segna come completato'}
                    className={`w-5 h-5 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center ${
                      step.status === 'DONE'
                        ? 'bg-accent border-accent'
                        : 'border-white/40 hover:border-accent'
                    }`}
                  >
                    {step.status === 'DONE' && (
                      <span className="text-dark text-xs font-bold leading-none">✓</span>
                    )}
                  </button>
                ) : (
                  <span
                    className={`w-5 h-5 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center text-xs ${
                      step.status === 'DONE' ? 'bg-accent border-accent text-dark' : 'border-white/40'
                    }`}
                  >
                    {step.status === 'DONE' ? '✓' : ''}
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  {editingId === step.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="flex-1 px-2 py-1 bg-dark border border-accent/20 rounded text-white text-sm"
                        autoFocus
                      />
                      <Button size="sm" onClick={() => handleSaveRename(step.id)}>
                        Salva
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                        Annulla
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span
                        className={
                          step.status === 'DONE'
                            ? 'text-white/50 line-through'
                            : 'text-white'
                        }
                      >
                        {step.title}
                      </span>
                      {step.status === 'DONE' && step.completedAt && (
                        <p className="text-xs text-white/40 mt-0.5">
                          Completato
                          {step.completedBy ? ` da ${step.completedBy.name}` : ''}
                          {' — '}
                          {format(new Date(step.completedAt), 'dd MMM yyyy HH:mm', { locale: it })}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {canAdmin && editingId !== step.id && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(step.id)
                        setEditTitle(step.title)
                      }}
                      className="text-xs text-accent hover:underline px-1"
                    >
                      Rinomina
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(step.id, step.title)}
                      className="text-xs text-red-400 hover:underline px-1"
                    >
                      Elimina
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {canManage && (
            <div className="flex gap-2 pt-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
                placeholder="Aggiungi step personalizzato..."
                className="flex-1 px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm"
              />
              <Button size="sm" onClick={handleAddStep}>
                Aggiungi
              </Button>
            </div>
          )}

          {allCompleted && workStatus !== 'DONE' && canAdmin && (
            <div className="mt-4 p-3 bg-accent/10 border border-accent/30 rounded-md">
              <p className="text-sm text-white/80 mb-2">
                Tutti gli step sono completati. Vuoi segnare il lavoro come Fatto?
              </p>
              <Button size="sm" onClick={handleMarkWorkDone}>
                Segna lavoro come Fatto
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
