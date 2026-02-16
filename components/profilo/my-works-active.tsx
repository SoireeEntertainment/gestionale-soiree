'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Work, Client, Category } from '@prisma/client'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { updateWork } from '@/app/actions/works'
import { createWorkComment } from '@/app/actions/work-comments'
import { WorkStepsSection } from './work-steps-section'

type WorkWithRelations = Work & { client: Client; category: Category }

const statusLabels: Record<string, string> = {
  TODO: 'Da Fare',
  IN_PROGRESS: 'In Corso',
  IN_REVIEW: 'In Revisione',
  WAITING_CLIENT: 'Attesa Cliente',
  DONE: 'Completato',
  PAUSED: 'In Pausa',
  CANCELED: 'Annullato',
}

const priorityLabels: Record<string, string> = {
  LOW: 'Bassa',
  MEDIUM: 'Media',
  HIGH: 'Alta',
}

type MyWorksActiveProps = {
  works: WorkWithRelations[]
  categories: { id: string; name: string }[]
  canWrite: boolean
}

export function MyWorksActive({ works: initialWorks, categories, canWrite }: MyWorksActiveProps) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [deadlineFilter, setDeadlineFilter] = useState('')
  const [noteWorkId, setNoteWorkId] = useState<string | null>(null)
  const [noteBody, setNoteBody] = useState('')
  const [stepsWorkId, setStepsWorkId] = useState<string | null>(null)

  const filtered = initialWorks.filter((w) => {
    if (statusFilter && w.status !== statusFilter) return false
    if (categoryFilter && w.categoryId !== categoryFilter) return false
    if (deadlineFilter === 'OGGI') {
      const d = w.deadline ? new Date(w.deadline) : null
      const today = new Date()
      if (!d || d.getDate() !== today.getDate() || d.getMonth() !== today.getMonth()) return false
    }
    if (deadlineFilter === '7_GG') {
      const d = w.deadline ? new Date(w.deadline) : null
      const in7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      if (!d || d > in7) return false
    }
    if (deadlineFilter === 'SCADUTI') {
      if (!w.deadline || new Date(w.deadline) >= new Date()) return false
    }
    return true
  })

  const handleStatusChange = async (workId: string, newStatus: string) => {
    if (!canWrite) return
    try {
      const work = initialWorks.find((w) => w.id === workId)
      if (!work) return
      const payload = {
        title: work.title,
        description: work.description ?? '',
        clientId: work.clientId,
        categoryId: work.categoryId,
        status: newStatus,
        priority: work.priority ?? undefined,
        deadline: work.deadline ? format(new Date(work.deadline), "yyyy-MM-dd'T'HH:mm") : '',
        assignedToUserId: work.assignedToUserId,
      }
      await updateWork(workId, payload)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const handleAddNote = async (workId: string) => {
    if (!noteBody.trim()) return
    try {
      await createWorkComment(workId, noteBody.trim())
      setNoteWorkId(null)
      setNoteBody('')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-6 mb-8" id="lavori-attivi">
      <h2 className="text-xl font-semibold text-white mb-4">I miei lavori (attivi)</h2>

      <div className="flex flex-wrap gap-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm"
          style={{ backgroundColor: 'var(--dark)', color: '#fff', border: '1px solid rgba(16,249,199,0.2)', borderRadius: '6px', padding: '8px 12px' }}
        >
          <option value="">Stato: tutti</option>
          {Object.entries(statusLabels).filter(([k]) => !['DONE', 'CANCELED'].includes(k)).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm"
          style={{ backgroundColor: 'var(--dark)', color: '#fff', border: '1px solid rgba(16,249,199,0.2)', borderRadius: '6px', padding: '8px 12px' }}
        >
          <option value="">Categoria: tutte</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={deadlineFilter}
          onChange={(e) => setDeadlineFilter(e.target.value)}
          className="px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm"
          style={{ backgroundColor: 'var(--dark)', color: '#fff', border: '1px solid rgba(16,249,199,0.2)', borderRadius: '6px', padding: '8px 12px' }}
        >
          <option value="">Scadenza: tutte</option>
          <option value="OGGI">Oggi</option>
          <option value="7_GG">Prossimi 7 giorni</option>
          <option value="SCADUTI">Scaduti</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-accent/10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-accent uppercase">Lavoro / Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-accent uppercase">Stato</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-accent uppercase">Priorità</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-accent uppercase">Scadenza</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-accent uppercase">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filtered.map((w) => {
              const isOverdue = w.deadline && new Date(w.deadline) < new Date()
              return (
                <tr key={w.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <Link href={`/works/${w.id}`} className="text-accent hover:underline font-medium">
                      {w.title}
                    </Link>
                    <div className="text-white/60 text-sm">{w.client.name} · {w.category.name}</div>
                  </td>
                  <td className="px-4 py-3">
                    {canWrite ? (
                      <select
                        value={w.status}
                        onChange={(e) => handleStatusChange(w.id, e.target.value)}
                        className="px-2 py-1 bg-dark border border-accent/20 rounded text-white text-sm"
                        style={{ backgroundColor: 'var(--dark)', color: '#fff', border: '1px solid rgba(16,249,199,0.2)', borderRadius: '4px', padding: '4px 8px', fontSize: '13px' }}
                      >
                        {Object.entries(statusLabels).filter(([k]) => !['DONE', 'CANCELED'].includes(k)).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded bg-accent/20 text-accent">
                        {statusLabels[w.status] ?? w.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/70 text-sm">
                    {w.priority ? priorityLabels[w.priority] ?? w.priority : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {w.deadline ? (
                      <span className={isOverdue ? 'text-red-400' : 'text-white/70'} style={isOverdue ? { color: '#f87171' } : undefined}>
                        {format(new Date(w.deadline), 'dd MMM yyyy', { locale: it })}
                        {isOverdue && <span style={{ color: '#f87171', fontWeight: 500 }}> (scaduto)</span>}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Link href={`/works/${w.id}`}>
                      <Button variant="ghost" size="sm">Dettagli</Button>
                    </Link>
                    {canWrite && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setNoteWorkId(noteWorkId === w.id ? null : w.id)}
                        >
                          Nota
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setStepsWorkId(stepsWorkId === w.id ? null : w.id)}
                        >
                          Processo
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-white/50">
          Nessun lavoro attivo assegnato (o nessun lavoro con i filtri selezionati).
        </div>
      )}

      {/* Dialog nota veloce */}
      {noteWorkId && (
        <Dialog open={!!noteWorkId} onOpenChange={(open) => !open && setNoteWorkId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Aggiungi nota</DialogTitle>
            </DialogHeader>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white min-h-[100px]"
              placeholder="Scrivi un commento..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setNoteWorkId(null)}>Annulla</Button>
              <Button onClick={() => handleAddNote(noteWorkId)}>Salva</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Processo (step) inline sotto la riga se aperto */}
      {stepsWorkId && (
        <WorkStepsSection
          workId={stepsWorkId}
          onClose={() => setStepsWorkId(null)}
          canWrite={canWrite}
        />
      )}
    </div>
  )
}
