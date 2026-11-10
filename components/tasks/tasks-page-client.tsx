'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Category, Client, User } from '@prisma/client'
import {
  applyTaskToUniverseNode,
  clearContactTrackerFromUniverseNode,
  type DailyTaskDTO,
  type UniverseClientNode,
} from '@/lib/daily-tasks'
import { todayDateOnlyRome } from '@/lib/timeline-dates'
import {
  deleteDailyTask,
  getMyDailyTasks,
  markClientContacted,
  markClientNeedsContact,
  toggleDailyTask,
} from '@/app/actions/daily-tasks'
import { ClientUniverse } from '@/components/tasks/client-universe'
import { TasksList } from '@/components/tasks/tasks-list'
import { TaskFormDialog } from '@/components/tasks/task-form-dialog'
import { ContactCompleteDialog } from '@/components/tasks/contact-complete-dialog'
import { DeleteTaskConfirmDialog } from '@/components/tasks/delete-task-confirm-dialog'
import { NewWorkModal } from '@/components/works/new-work-modal'
import { Button } from '@/components/ui/button'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type ClientOption = { id: string; name: string }

export function TasksPageClient({
  initialTasks,
  initialUniverse,
  clients,
  workClients = [],
  categories = [],
  users = [],
  canCreateWork = false,
}: {
  initialTasks: DailyTaskDTO[]
  initialUniverse: UniverseClientNode[]
  clients: ClientOption[]
  workClients?: Client[]
  categories?: Category[]
  users?: User[]
  canCreateWork?: boolean
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
  const [defaultClientId, setDefaultClientId] = useState<string | undefined>(undefined)
  const [completeTask, setCompleteTask] = useState<DailyTaskDTO | null>(null)
  const [pendingUniverseDelete, setPendingUniverseDelete] = useState<DailyTaskDTO | null>(null)
  const [workFromTask, setWorkFromTask] = useState<DailyTaskDTO | null>(null)
  const [workModalOpen, setWorkModalOpen] = useState(false)
  const [isDeletingUniverse, startDeleteUniverseTransition] = useTransition()
  const [isPending, startTransition] = useTransition()
  const reopenTaskAfterWorkCancel = useRef<DailyTaskDTO | null>(null)
  /** Evita che un refresh server sovrascriva update ottimistici più recenti. */
  const suppressServerSyncUntil = useRef(0)
  /** Task eliminate localmente: filtra fino a sync server stabile. */
  const deletedTaskIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (Date.now() < suppressServerSyncUntil.current) return
    const serverIds = new Set(initialTasks.map((t) => t.id))
    for (const id of deletedTaskIdsRef.current) {
      if (!serverIds.has(id)) deletedTaskIdsRef.current.delete(id)
    }
    setTasks(initialTasks.filter((t) => !deletedTaskIdsRef.current.has(t.id)))
    setUniverse(
      initialUniverse.map((node) =>
        node.taskId && deletedTaskIdsRef.current.has(node.taskId)
          ? clearContactTrackerFromUniverseNode(node, node.taskId)
          : node
      )
    )
  }, [initialTasks, initialUniverse])

  // Deep-link da dettaglio Lavoro: /tasks?taskId=...
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const taskId = params.get('taskId')?.trim()
    if (!taskId) return
    const found = initialTasks.find((t) => t.id === taskId)
    if (!found) return
    setDefaultClientId(undefined)
    setEditTask(found)
    setFormOpen(true)
    params.delete('taskId')
    const next = params.toString()
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname
    window.history.replaceState({}, '', url)
  }, [initialTasks])

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

  const markLocalDirty = (ms = 2500) => {
    suppressServerSyncUntil.current = Date.now() + ms
  }

  const refresh = () => router.refresh()

  const upsertTask = (saved: DailyTaskDTO) => {
    markLocalDirty()
    setTasks((prev) => {
      const without = prev.filter((t) => t.id !== saved.id)
      return [saved, ...without]
    })
    if (saved.type === 'CONTACT_CLIENT' && saved.clientId) {
      setUniverse((prev) => {
        const exists = prev.some((n) => n.clientId === saved.clientId)
        if (!exists) {
          return [
            applyTaskToUniverseNode(
              {
                clientId: saved.clientId!,
                clientName: saved.clientName ?? 'Cliente',
                status: 'neutral',
                taskId: null,
                lastContactedAt: null,
                nextReactivateAt: null,
                dueDate: null,
              },
              saved
            ),
            ...prev,
          ]
        }
        return prev.map((n) => applyTaskToUniverseNode(n, saved))
      })
    }
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
        const saved = await markClientContacted({ clientId: node.clientId })
        upsertTask(saved)
        showToast('Cliente segnato come sentito', 'success')
        refresh()
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Operazione non riuscita', 'error')
      }
    })
  }

  const handleMarkNeedsContact = (node: UniverseClientNode) => {
    const previousUniverse = universe
    const previousTasks = tasks
    // Optimistic: verde → rosso subito
    markLocalDirty()
    setUniverse((prev) =>
      prev.map((n) =>
        n.clientId === node.clientId
          ? {
              ...n,
              status: 'red',
              nextReactivateAt: null,
              dueDate: todayDateOnlyRome(),
            }
          : n
      )
    )
    if (node.taskId) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === node.taskId
            ? {
                ...t,
                status: 'OPEN',
                completedAt: null,
                nextReactivateAt: null,
                dueDate: todayDateOnlyRome(),
              }
            : t
        )
      )
    }

    startTransition(async () => {
      try {
        const saved = await markClientNeedsContact({
          taskId: node.taskId ?? undefined,
          clientId: node.clientId,
        })
        upsertTask(saved)
        showToast('Cliente riportato da sentire', 'success')
        refresh()
      } catch (error) {
        setUniverse(previousUniverse)
        setTasks(previousTasks)
        showToast(error instanceof Error ? error.message : 'Operazione non riuscita', 'error')
      }
    })
  }

  const handleOpenTaskFromUniverse = (node: UniverseClientNode) => {
    if (!node.taskId) {
      setFormMode('CONTACT_CLIENT')
      setEditTask(null)
      setDefaultClientId(node.clientId)
      setFormOpen(true)
      return
    }
    const task = tasks.find((t) => t.id === node.taskId) ?? null
    if (task) {
      setDefaultClientId(undefined)
      setEditTask(task)
      setFormOpen(true)
    }
  }

  const handleDeleteTask = async (task: DailyTaskDTO) => {
    const previousTasks = tasks
    const previousUniverse = universe
    deletedTaskIdsRef.current.add(task.id)
    markLocalDirty()
    setTasks((prev) => prev.filter((t) => t.id !== task.id))
    if (task.type === 'CONTACT_CLIENT' && task.clientId) {
      setUniverse((prev) =>
        prev.map((n) =>
          n.clientId === task.clientId
            ? clearContactTrackerFromUniverseNode(n, task.id)
            : n
        )
      )
    }
    if (editTask?.id === task.id) {
      setEditTask(null)
      setFormOpen(false)
    }
    if (completeTask?.id === task.id) setCompleteTask(null)

    let toasted = false
    try {
      const result = await deleteDailyTask(task.id)
      if (!result.success) {
        deletedTaskIdsRef.current.delete(task.id)
        setTasks(previousTasks)
        setUniverse(previousUniverse)
        showToast(result.message, 'error')
        toasted = true
        throw new Error(result.message)
      }
      showToast('Task eliminata', 'success')
      refresh()
    } catch (error) {
      deletedTaskIdsRef.current.delete(task.id)
      setTasks(previousTasks)
      setUniverse(previousUniverse)
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
    }
  }

  const handleRequestDeleteFromUniverse = (node: UniverseClientNode) => {
    if (!node.taskId) return
    const task =
      tasks.find((t) => t.id === node.taskId) ??
      ({
        id: node.taskId,
        title: `Sentire ${node.clientName}`,
        type: 'CONTACT_CLIENT',
        status: node.status === 'green' ? 'DONE' : 'OPEN',
        dueDate: node.dueDate ?? todayDateOnlyRome(),
        notes: null,
        userId: '',
        clientId: node.clientId,
        clientName: node.clientName,
        completedAt: null,
        lastContactedAt: node.lastContactedAt,
        nextReactivateAt: node.nextReactivateAt,
        linkedWork: null,
        createdAt: '',
        updatedAt: '',
      } satisfies DailyTaskDTO)
    setPendingUniverseDelete(task)
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
              setDefaultClientId(undefined)
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
              setDefaultClientId(undefined)
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
        onMarkNeedsContact={handleMarkNeedsContact}
        onOpenTask={handleOpenTaskFromUniverse}
        onDeleteTracker={handleRequestDeleteFromUniverse}
      />

      <section className="rounded-2xl border border-accent/15 bg-[#101317]/90 p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Lista task</h2>
            <p className="mt-0.5 text-xs text-white/45">
              Ordinamento: scadenza cronologica decrescente
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 md:w-auto">
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
          canOpenWorks={canCreateWork}
          onToggle={handleToggle}
          onEdit={(task) => {
            setDefaultClientId(undefined)
            setEditTask(task)
            setFormOpen(true)
          }}
          onDelete={handleDeleteTask}
        />
        {isPending ? <p className="mt-2 text-xs text-white/35">Aggiornamento…</p> : null}
      </section>

      <TaskFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) {
            setEditTask(null)
            setDefaultClientId(undefined)
          }
        }}
        clients={clients}
        mode={editTask?.type ?? formMode}
        editTask={editTask}
        defaultClientId={defaultClientId}
        canCreateWork={canCreateWork}
        onCreateWork={(task) => {
          if (!task.clientId) {
            showToast('Associa un cliente alla Task prima di creare un Lavoro.', 'error')
            return
          }
          reopenTaskAfterWorkCancel.current = task
          setWorkFromTask(task)
          setFormOpen(false)
          setWorkModalOpen(true)
        }}
        onSaved={(saved) => {
          upsertTask(saved)
          refresh()
        }}
        onDeleted={handleDeleteTask}
      />

      {canCreateWork ? (
        <NewWorkModal
          open={workModalOpen}
          onOpenChange={(open) => {
            setWorkModalOpen(open)
            if (!open) setWorkFromTask(null)
          }}
          clients={workClients}
          categories={categories}
          users={users}
          title="Crea lavoro da Task"
          prefill={
            workFromTask && workFromTask.clientId
              ? {
                  clientId: workFromTask.clientId,
                  title: workFromTask.title,
                  description: workFromTask.notes ?? '',
                  deadline:
                    workFromTask.dueDate >= todayDateOnlyRome() ? workFromTask.dueDate : undefined,
                  sourceDailyTaskId: workFromTask.id,
                  lockClient: true,
                }
              : undefined
          }
          onCancel={() => {
            const t = reopenTaskAfterWorkCancel.current
            reopenTaskAfterWorkCancel.current = null
            if (t) {
              setEditTask(t)
              setFormOpen(true)
            }
          }}
          onCreated={async (workId) => {
            reopenTaskAfterWorkCancel.current = null
            showToast('Lavoro creato e collegato alla Task', 'success')
            try {
              const latest = await getMyDailyTasks({ status: 'ALL' })
              const updated = latest.find((t) => t.id === workFromTask?.id)
              if (updated) upsertTask(updated)
              else if (workFromTask) {
                upsertTask({
                  ...workFromTask,
                  linkedWork: {
                    id: workId,
                    title: workFromTask.title,
                    status: 'TODO',
                    deadline: workFromTask.dueDate,
                    assigneeNames: [],
                  },
                })
              }
            } catch {
              refresh()
            }
            refresh()
          }}
        />
      ) : null}

      <ContactCompleteDialog
        task={completeTask}
        open={!!completeTask}
        onOpenChange={(open) => {
          if (!open) setCompleteTask(null)
        }}
        onCompleted={(saved) => {
          upsertTask(saved)
          refresh()
        }}
      />

      <DeleteTaskConfirmDialog
        task={pendingUniverseDelete}
        open={!!pendingUniverseDelete}
        onOpenChange={(open) => {
          if (!open && !isDeletingUniverse) setPendingUniverseDelete(null)
        }}
        isPending={isDeletingUniverse}
        onConfirm={() => {
          if (!pendingUniverseDelete) return
          const task = pendingUniverseDelete
          startDeleteUniverseTransition(async () => {
            try {
              await handleDeleteTask(task)
              setPendingUniverseDelete(null)
            } catch {
              // rollback + toast già gestiti
            }
          })
        }}
      />
    </div>
  )
}
