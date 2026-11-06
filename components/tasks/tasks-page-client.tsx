'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DailyTaskDTO, UniverseClientNode } from '@/lib/daily-tasks'
import { todayDateOnlyRome } from '@/lib/timeline-dates'
import { markClientContacted, toggleDailyTask } from '@/app/actions/daily-tasks'
import { ClientUniverse } from '@/components/tasks/client-universe'
import { TasksList } from '@/components/tasks/tasks-list'
import { TaskFormDialog } from '@/components/tasks/task-form-dialog'
import { ContactCompleteDialog } from '@/components/tasks/contact-complete-dialog'
import { Button } from '@/components/ui/button'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type ClientOption = { id: string; name: string }

export function TasksPageClient({
  initialTasks,
  initialUniverse,
  clients,
}: {
  initialTasks: DailyTaskDTO[]
  initialUniverse: UniverseClientNode[]
  clients: ClientOption[]
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [universe, setUniverse] = useState(initialUniverse)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'DONE'>('OPEN')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'GENERAL' | 'CONTACT_CLIENT'>('ALL')
  const [dueBucket, setDueBucket] = useState<'ALL' | 'OVERDUE' | 'TODAY' | 'UPCOMING'>('ALL')
  const [clientFilter, setClientFilter] = useState('')
  const [q, setQ] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'GENERAL' | 'CONTACT_CLIENT'>('GENERAL')
  const [editTask, setEditTask] = useState<DailyTaskDTO | null>(null)
  const [completeTask, setCompleteTask] = useState<DailyTaskDTO | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const today = todayDateOnlyRome()
    return tasks.filter((task) => {
      if (statusFilter !== 'ALL' && task.status !== statusFilter) return false
      if (typeFilter !== 'ALL' && task.type !== typeFilter) return false
      if (clientFilter && task.clientId !== clientFilter) return false
      if (q.trim() && !task.title.toLowerCase().includes(q.trim().toLowerCase())) return false
      if (dueBucket === 'OVERDUE' && !(task.status === 'OPEN' && task.dueDate < today)) return false
      if (dueBucket === 'TODAY' && task.dueDate !== today) return false
      if (dueBucket === 'UPCOMING' && !(task.dueDate > today)) return false
      return true
    })
  }, [tasks, statusFilter, typeFilter, clientFilter, q, dueBucket])

  const refresh = () => router.refresh()

  const upsertTask = (saved: DailyTaskDTO) => {
    setTasks((prev) => {
      const without = prev.filter((t) => t.id !== saved.id)
      return [saved, ...without]
    })
  }

  const handleToggle = (task: DailyTaskDTO) => {
    if (task.type === 'CONTACT_CLIENT' && task.status === 'OPEN') {
      setCompleteTask(task)
      return
    }
    startTransition(async () => {
      try {
        const saved = await toggleDailyTask(task.id)
        upsertTask(saved)
        refresh()
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Aggiornamento non riuscito', 'error')
      }
    })
  }

  const handleMarkContacted = (node: UniverseClientNode) => {
    if (node.taskId) {
      const task = tasks.find((t) => t.id === node.taskId)
      if (task) {
        setCompleteTask(task)
        return
      }
    }
    startTransition(async () => {
      try {
        await markClientContacted({ clientId: node.clientId })
        showToast('Cliente segnato come sentito', 'success')
        refresh()
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Operazione non riuscita', 'error')
      }
    })
  }

  const handleOpenTaskFromUniverse = (node: UniverseClientNode) => {
    if (!node.taskId) {
      setFormMode('CONTACT_CLIENT')
      setEditTask(null)
      setFormOpen(true)
      return
    }
    const task = tasks.find((t) => t.id === node.taskId) ?? null
    if (task) {
      setEditTask(task)
      setFormOpen(true)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              setFormMode('GENERAL')
              setEditTask(null)
              setFormOpen(true)
            }}
          >
            Nuova task
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setFormMode('CONTACT_CLIENT')
              setEditTask(null)
              setFormOpen(true)
            }}
          >
            Sentire cliente
          </Button>
        </div>
      </div>

      <ClientUniverse
        nodes={universe}
        onMarkContacted={handleMarkContacted}
        onOpenTask={handleOpenTaskFromUniverse}
      />

      <section className="rounded-2xl border border-accent/15 bg-[#101317]/90 p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Lista task</h2>
            <p className="text-xs text-white/45 mt-0.5">
              Ordinamento: scadenza cronologica decrescente
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="min-h-[40px] rounded-md border border-accent/20 bg-dark px-2 text-xs text-white"
            >
              <option value="OPEN">Aperte</option>
              <option value="DONE">Completate</option>
              <option value="ALL">Tutte</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="min-h-[40px] rounded-md border border-accent/20 bg-dark px-2 text-xs text-white"
            >
              <option value="ALL">Tutti i tipi</option>
              <option value="GENERAL">Generiche</option>
              <option value="CONTACT_CLIENT">Sentire cliente</option>
            </select>
            <select
              value={dueBucket}
              onChange={(e) => setDueBucket(e.target.value as typeof dueBucket)}
              className="min-h-[40px] rounded-md border border-accent/20 bg-dark px-2 text-xs text-white"
            >
              <option value="ALL">Tutte le date</option>
              <option value="OVERDUE">Scadute</option>
              <option value="TODAY">Oggi</option>
              <option value="UPCOMING">Prossime</option>
            </select>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="min-h-[40px] rounded-md border border-accent/20 bg-dark px-2 text-xs text-white"
            >
              <option value="">Tutti i clienti</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca…"
              className={cn(
                'min-h-[40px] rounded-md border border-accent/20 bg-dark px-2 text-xs text-white',
                'col-span-2 sm:col-span-1'
              )}
            />
          </div>
        </div>

        <TasksList
          tasks={filtered}
          onToggle={handleToggle}
          onEdit={(task) => {
            setEditTask(task)
            setFormOpen(true)
          }}
        />
        {isPending ? <p className="mt-2 text-xs text-white/35">Aggiornamento…</p> : null}
      </section>

      <TaskFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditTask(null)
        }}
        clients={clients}
        mode={editTask?.type ?? formMode}
        editTask={editTask}
        onSaved={(saved) => {
          upsertTask(saved)
          refresh()
        }}
      />

      <ContactCompleteDialog
        task={completeTask}
        open={!!completeTask}
        onOpenChange={(open) => {
          if (!open) setCompleteTask(null)
        }}
        onCompleted={(saved) => {
          upsertTask(saved)
          setUniverse((prev) =>
            prev.map((n) =>
              n.clientId === saved.clientId
                ? {
                    ...n,
                    status: 'green',
                    lastContactedAt: saved.lastContactedAt,
                    nextReactivateAt: saved.nextReactivateAt,
                    taskId: saved.id,
                  }
                : n
            )
          )
          refresh()
        }}
      />
    </div>
  )
}
