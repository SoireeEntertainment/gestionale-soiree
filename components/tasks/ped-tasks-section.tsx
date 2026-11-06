'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DailyTaskDTO } from '@/lib/daily-tasks'
import { deleteDailyTask, toggleDailyTask } from '@/app/actions/daily-tasks'
import { TasksList } from '@/components/tasks/tasks-list'
import { TaskFormDialog } from '@/components/tasks/task-form-dialog'
import { ContactCompleteDialog } from '@/components/tasks/contact-complete-dialog'
import { Button } from '@/components/ui/button'
import { showToast } from '@/lib/toast'

type ClientOption = { id: string; name: string }

export function PedTasksSection({
  initialTasks,
  clients,
  readOnly = false,
}: {
  initialTasks: DailyTaskDTO[]
  clients: ClientOption[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'GENERAL' | 'CONTACT_CLIENT'>('GENERAL')
  const [completeTask, setCompleteTask] = useState<DailyTaskDTO | null>(null)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (deletingId) return
    setTasks(initialTasks)
  }, [initialTasks, deletingId])

  const openTasks = tasks.filter((t) => t.status === 'OPEN').slice(0, 8)

  const handleToggle = (task: DailyTaskDTO) => {
    if (readOnly) return
    if (task.type === 'CONTACT_CLIENT' && task.status === 'OPEN') {
      setCompleteTask(task)
      return
    }
    startTransition(async () => {
      try {
        const saved = await toggleDailyTask(task.id)
        setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)))
        router.refresh()
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Aggiornamento non riuscito', 'error')
      }
    })
  }

  const handleDelete = async (task: DailyTaskDTO) => {
    if (readOnly || deletingId) return
    const previous = tasks
    setDeletingId(task.id)
    setTasks((prev) => prev.filter((t) => t.id !== task.id))
    let toasted = false
    try {
      const result = await deleteDailyTask(task.id)
      if (!result.success) {
        setTasks(previous)
        showToast(result.message, 'error')
        toasted = true
        throw new Error(result.message)
      }
      showToast('Task eliminata', 'success')
      router.refresh()
    } catch (error) {
      setTasks(previous)
      if (!toasted) {
        const raw = error instanceof Error ? error.message : ''
        showToast(
          raw.includes('Server Components') || raw.includes('omitted in production')
            ? 'Eliminazione non riuscita. Ricarica la pagina e riprova.'
            : raw || 'Eliminazione non riuscita',
          'error'
        )
      }
      throw error instanceof Error ? error : new Error('Eliminazione non riuscita')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-accent/15 bg-[#101317]/90 p-4 md:p-5">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Task</h2>
          <p className="text-xs text-white/45">Promemoria giornalieri · non confondere con il PED editoriale</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setFormMode('GENERAL')
                  setFormOpen(true)
                }}
              >
                Nuova task
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setFormMode('CONTACT_CLIENT')
                  setFormOpen(true)
                }}
              >
                Sentire cliente
              </Button>
            </>
          )}
          <Link
            href="/tasks"
            className="inline-flex min-h-[36px] items-center rounded-md border border-accent/30 px-3 text-sm text-accent hover:bg-accent/10"
          >
            Apri Task →
          </Link>
        </div>
      </div>

      <TasksList
        tasks={openTasks}
        onToggle={handleToggle}
        onDelete={readOnly ? undefined : handleDelete}
        compact
      />
      {isPending ? <p className="mt-2 text-xs text-white/35">Aggiornamento…</p> : null}

      {!readOnly && (
        <>
          <TaskFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            clients={clients}
            mode={formMode}
            onSaved={(saved) => {
              setTasks((prev) => [saved, ...prev.filter((t) => t.id !== saved.id)])
              router.refresh()
            }}
            onDeleted={handleDelete}
          />
          <ContactCompleteDialog
            task={completeTask}
            open={!!completeTask}
            onOpenChange={(open) => {
              if (!open) setCompleteTask(null)
            }}
            onCompleted={(saved) => {
              setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)))
              router.refresh()
            }}
          />
        </>
      )}
    </section>
  )
}
