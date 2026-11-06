'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DailyTaskDTO } from '@/lib/daily-tasks'
import { toggleDailyTask } from '@/app/actions/daily-tasks'
import { TasksList } from '@/components/tasks/tasks-list'
import { TaskFormDialog } from '@/components/tasks/task-form-dialog'
import { ContactCompleteDialog } from '@/components/tasks/contact-complete-dialog'
import { Button } from '@/components/ui/button'
import { showToast } from '@/lib/toast'

type ClientOption = { id: string; name: string }

/** Sostituisce la vecchia sezione Promemoria in Area operativa. */
export function ProfiloTasksSection({
  initialTasks,
  clients,
}: {
  initialTasks: DailyTaskDTO[]
  clients: ClientOption[]
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'GENERAL' | 'CONTACT_CLIENT'>('GENERAL')
  const [completeTask, setCompleteTask] = useState<DailyTaskDTO | null>(null)
  const [, startTransition] = useTransition()

  const openTasks = tasks.filter((t) => t.status === 'OPEN').slice(0, 10)

  const handleToggle = (task: DailyTaskDTO) => {
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
        showToast(error instanceof Error ? error.message : 'Errore', 'error')
      }
    })
  }

  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-6 mb-8">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Task</h2>
          <p className="text-xs text-white/45 mt-0.5">Promemoria giornalieri</p>
        </div>
        <Link href="/tasks" className="text-sm text-accent hover:underline shrink-0">
          Apri tutto
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setFormMode('GENERAL')
            setFormOpen(true)
          }}
        >
          Nuova
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
      </div>

      <TasksList tasks={openTasks} onToggle={handleToggle} compact />

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        clients={clients}
        mode={formMode}
        onSaved={(saved) => {
          setTasks((prev) => [saved, ...prev.filter((t) => t.id !== saved.id)])
          router.refresh()
        }}
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
    </div>
  )
}
