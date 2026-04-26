'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Work, Client, Category, User } from '@prisma/client'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { WorkForm } from './work-form'
import { deleteWork } from '@/app/actions/works'
import { useRouter } from 'next/navigation'
import { WorkStatusBadge } from './work-status-badge'

interface WorkDetailProps {
  work: Work & { client: Client; category: Category; assignedTo?: User | null }
  clients: Client[]
  categories: Category[]
  users: User[]
  returnTo?: string
}

const priorityLabels: Record<string, string> = {
  LOW: 'Bassa',
  MEDIUM: 'Media',
  HIGH: 'Alta',
}

export function WorkDetail({ work, clients, categories, users, returnTo = '/works' }: WorkDetailProps) {
  const router = useRouter()
  const [isEditOpen, setIsEditOpen] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Sei sicuro di voler eliminare questo lavoro?')) return

    try {
      await deleteWork(work.id)
      router.push(returnTo)
    } catch (error) {
      console.error('Error:', error)
      alert('Errore nell\'eliminazione')
    }
  }

  const isExpired = work.deadline && new Date(work.deadline) < new Date() && work.status !== 'DONE'

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href={returnTo} className="text-accent hover:underline mb-2 inline-block">
              ← Torna ai lavori
            </Link>
            <h1 className="text-3xl font-bold text-white">{work.title}</h1>
          </div>
          <div className="flex space-x-2">
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                <Button>Modifica</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Modifica Lavoro</DialogTitle>
                </DialogHeader>
                <WorkForm
                  work={work}
                  clients={clients}
                  categories={categories}
                  users={users}
                  onSuccess={() => setIsEditOpen(false)}
                />
              </DialogContent>
            </Dialog>
            <Button variant="danger" onClick={handleDelete}>
              Elimina
            </Button>
          </div>
        </div>

        <div className="bg-dark border border-accent/20 rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-white/50 mb-1">Cliente</div>
              <Link
                href={`/clients/${work.clientId}`}
                className="text-accent hover:underline"
              >
                {work.client.name}
              </Link>
            </div>
            <div>
              <div className="text-sm text-white/50 mb-1">Categoria</div>
              <Link
                href={`/categories/${work.categoryId}`}
                className="text-accent hover:underline"
              >
                {work.category.name}
              </Link>
            </div>
            <div>
              <div className="text-sm text-white/50 mb-1">Stato</div>
              <WorkStatusBadge status={work.status} className="text-sm" />
            </div>
            {work.priority && (
              <div>
                <div className="text-sm text-white/50 mb-1">Priorità</div>
                <span className="text-white">{priorityLabels[work.priority]}</span>
              </div>
            )}
            {work.deadline && (
              <div>
                <div className="text-sm text-white/50 mb-1">Scadenza</div>
                <span className={isExpired ? 'text-red-400' : 'text-white'}>
                  {format(new Date(work.deadline), 'dd MMMM yyyy HH:mm', { locale: it })}
                  {isExpired && <span className="ml-2 text-xs">(Scaduto)</span>}
                </span>
              </div>
            )}
            {work.assignedTo && (
              <div>
                <div className="text-sm text-white/50 mb-1">Assegnato a</div>
                <span className="text-white">{work.assignedTo.name}</span>
              </div>
            )}
          </div>
          <div>
            <div className="text-sm text-white/50 mb-1">Descrizione</div>
            {work.description ? (
              <div className="text-white whitespace-pre-wrap break-words leading-relaxed">{work.description}</div>
            ) : (
              <span className="text-white/50">Nessuna descrizione</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

