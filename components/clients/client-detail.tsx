'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Client, Category, ClientCategory, Work } from '@prisma/client'
import { ClientForm } from './client-form'
import { ClientCategoryTab } from './client-category-tab'
import { ClientPreventiviSection } from './client-preventivi-section'
import { ClientCredentialsSection } from './client-credentials-section'
import { ClientRenewalsSection } from './client-renewals-section'
import { ClientPedSection } from './client-ped-section'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { User } from '@prisma/client'
import { deleteClient } from '@/app/actions/clients'
import { showToast } from '@/lib/toast'

type ClientCredential = {
  id: string
  clientId: string
  label: string
  username: string | null
  password: string | null
  notes: string | null
}

export interface ClientDetailProps {
  client: Client & {
    clientCategories: (ClientCategory & { category: Category })[]
    works: (Work & { category: Category })[]
    preventivi?: { id: string; title: string; type: string; status: string; createdAt: Date; filePath?: string | null; items: { id: string; description: string; quantity: number; unitPrice: number }[] }[]
    assignedTo?: User | null
    credentials?: ClientCredential[]
  }
  allCategories: Category[]
  users: User[]
  canWrite?: boolean
  showPedSection?: boolean
  pedClients?: { id: string; name: string }[]
  pedWorks?: { id: string; title: string }[]
  pedContentsPerMonth?: number
  currentUserId?: string
  metaBusinessSuiteUrl?: string | null
  gestioneInserzioniUrl?: string | null
  renewals?: { id: string; clientId: string; serviceName: string; renewalDate: Date; billingDate: Date | null; notes: string | null; createdAt: Date; updatedAt: Date }[]
  pedTaskCounts?: { monthCount: number; totalCount: number }
  clientInPed?: boolean
}

export function ClientDetail({ client, allCategories, users, canWrite = true, showPedSection = false, pedClients = [], pedWorks = [], pedContentsPerMonth = 0, currentUserId = '', metaBusinessSuiteUrl, gestioneInserzioniUrl, renewals = [], pedTaskCounts, clientInPed = false }: ClientDetailProps) {
  const router = useRouter()
  const firstCategoryId = allCategories[0]?.id ?? ''
  const [activeTab, setActiveTab] = useState<string>(firstCategoryId)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const activeCategory = allCategories.find((c) => c.id === activeTab)
  const worksForActiveCategory = activeCategory
    ? client.works.filter((w) => w.categoryId === activeCategory.id)
    : []
  const clientCategoryForActive = activeCategory
    ? client.clientCategories.find((cc) => cc.categoryId === activeCategory.id) ?? null
    : null

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/clients" className="text-accent hover:underline mb-2 inline-block">
              ← Torna ai clienti
            </Link>
            <h1 className="text-3xl font-bold text-white">{client.name}</h1>
          </div>
          {canWrite && (
          <div className="flex items-center gap-2">
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                <Button>Modifica Cliente</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Modifica Cliente</DialogTitle>
                </DialogHeader>
                <ClientForm
                  client={client}
                  users={users}
                  onSuccess={() => setIsEditOpen(false)}
                />
              </DialogContent>
            </Dialog>
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="text-red-400 hover:text-red-300 hover:bg-red-500/20 border-red-500/30">
                  Elimina Cliente
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Elimina cliente</DialogTitle>
                </DialogHeader>
                <p className="text-white/80 text-sm">
                  Stai per eliminare <strong>{client.name}</strong>. Verranno eliminati anche tutti i lavori, i preventivi e i dati collegati. Questa azione non può essere annullata.
                </p>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="secondary" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>
                    Annulla
                  </Button>
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white"
                    disabled={isDeleting}
                    onClick={async () => {
                      setIsDeleting(true)
                      try {
                        await deleteClient(client.id)
                        showToast('Cliente eliminato', 'success')
                        setIsDeleteOpen(false)
                        router.push('/clients')
                      } catch (e) {
                        showToast(e instanceof Error ? e.message : 'Errore durante l\'eliminazione', 'error')
                        setIsDeleting(false)
                      }
                    }}
                  >
                    {isDeleting ? 'Eliminazione...' : 'Elimina'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          )}
        </div>

        {(pedTaskCounts != null || clientInPed) && (
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            {pedTaskCounts != null && (
              <span className="px-3 py-1.5 rounded-md text-sm font-medium bg-white/10 text-white/90 border border-accent/20">
                Task nel PED: <strong>{pedTaskCounts.monthCount}</strong> questo mese
                {pedTaskCounts.totalCount !== pedTaskCounts.monthCount && (
                  <> · Totale: <strong>{pedTaskCounts.totalCount}</strong></>
                )}
              </span>
            )}
            {clientInPed && (
              <span className="px-3 py-1.5 rounded-md text-sm font-medium bg-accent/20 text-accent border border-accent/40" title="Cliente presente nel PED di almeno un utente">
                Nel PED
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-6 items-center">
          {metaBusinessSuiteUrl ? (
            <a
              href={metaBusinessSuiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-md font-medium bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30"
            >
              Business Suite
            </a>
          ) : (
            <span
              className="px-4 py-2 rounded-md font-medium bg-white/5 text-white/50 border border-white/10 cursor-not-allowed"
              title="Imposta link in Modifica cliente"
            >
              Business Suite
            </span>
          )}
          {gestioneInserzioniUrl ? (
            <a
              href={gestioneInserzioniUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-md font-medium bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30"
            >
              Gestione Inserzioni
            </a>
          ) : (
            <span
              className="px-4 py-2 rounded-md font-medium bg-white/5 text-white/50 border border-white/10 cursor-not-allowed"
              title="Imposta link in Modifica cliente"
            >
              Gestione Inserzioni
            </span>
          )}
          {(!metaBusinessSuiteUrl || !gestioneInserzioniUrl) && canWrite && (
            <span className="text-white/50 text-xs">Imposta i link in Modifica cliente</span>
          )}
        </div>

        <div className="bg-dark border border-accent/20 rounded-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-white/50 mb-1">Contatto</div>
              <div className="text-white">{client.contactName || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-white/50 mb-1">Email</div>
              <div className="text-white">{client.email || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-white/50 mb-1">Telefono</div>
              <div className="text-white">{client.phone || '-'}</div>
            </div>
            {client.notes && (
              <div className="md:col-span-2">
                <div className="text-sm text-white/50 mb-1">Note</div>
                <div className="text-white">{client.notes}</div>
              </div>
            )}
          </div>
        </div>

        <ClientCredentialsSection
          clientId={client.id}
          credentials={client.credentials ?? []}
          canWrite={canWrite ?? false}
        />

        <ClientRenewalsSection
          clientId={client.id}
          initialRenewals={renewals}
          canWrite={canWrite ?? false}
        />

        {showPedSection && (
          <ClientPedSection
            clientId={client.id}
            clientName={client.name}
            clients={pedClients.length > 0 ? pedClients : [{ id: client.id, name: client.name }]}
            works={pedWorks}
            canWrite={canWrite}
            initialContentsPerMonth={pedContentsPerMonth}
            users={users.map((u) => ({ id: u.id, name: u.name }))}
            currentUserId={currentUserId}
          />
        )}

        {/* Tab: una per ogni categoria (lavori aperti) */}
        <div className="border-b border-accent/20 mb-6">
          <div className="flex flex-wrap gap-1">
            {allCategories.map((cat) => {
              const count = client.works.filter((w) => w.categoryId === cat.id).length
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
                    activeTab === cat.id
                      ? 'text-accent border-b-2 border-accent'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              )
            })}
          </div>
        </div>

        {activeCategory && (
          <ClientCategoryTab
            clientId={client.id}
            category={activeCategory}
            works={worksForActiveCategory}
            clientCategory={clientCategoryForActive}
            clients={[client]}
            categories={allCategories}
            users={users}
            canWrite={canWrite}
            isSocialAutoFromPed={clientInPed && activeCategory.name === 'Social'}
          />
        )}

        <ClientPreventiviSection
          clientId={client.id}
          clientName={client.name}
          preventivi={client.preventivi ?? []}
          allClients={[{ id: client.id, name: client.name }]}
          canWrite={canWrite}
        />
      </div>
    </div>
  )
}

