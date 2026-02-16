'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createTodo, toggleTodo, deleteTodo } from '@/app/actions/user-todos'

type Todo = { id: string; title: string; completed: boolean }

type PersonalTodosProps = {
  todos: Todo[]
  userId: string
}

export function PersonalTodos({ todos: initialTodos, userId }: PersonalTodosProps) {
  const router = useRouter()
  const [newTitle, setNewTitle] = useState('')

  const handleToggle = async (id: string) => {
    try {
      await toggleTodo(id)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    try {
      await createTodo(userId, newTitle.trim())
      setNewTitle('')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteTodo(id)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-semibold text-white mb-4">Promemoria</h2>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Nuovo promemoria..."
          className="flex-1 px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm"
        />
        <Button size="sm" onClick={handleAdd}>Aggiungi</Button>
      </div>

      <ul className="space-y-2">
        {initialTodos.map((t) => (
          <li key={t.id} className="flex items-center gap-3 group">
            <button
              type="button"
              onClick={() => handleToggle(t.id)}
              className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center ${
                t.completed ? 'bg-accent border-accent text-dark' : 'border-white/40 hover:border-accent'
              }`}
            >
              {t.completed && <span className="text-xs font-bold">✓</span>}
            </button>
            <span
              className={`flex-1 ${t.completed ? 'text-white/50 line-through' : 'text-white'}`}
            >
              {t.title}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100"
              onClick={() => handleDelete(t.id)}
            >
              Elimina
            </Button>
          </li>
        ))}
      </ul>

      {initialTodos.length === 0 && (
        <p className="text-white/50 py-4">Nessun promemoria. Aggiungine uno sopra.</p>
      )}
    </div>
  )
}
