'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Client, Category, Work, User } from '@prisma/client'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { WorkForm } from './work-form'
import { WorkStatusBadge } from './work-status-badge'
import { WORK_STATUS_META } from '@/lib/work-status'

interface WorksListProps {
  works: (Work & { client: Client; category: Category; assignedTo?: User | null })[]
  clients: Client[]
  categories: Category[]
  users: User[]
  filters: {
    clientId?: string
    categoryId?: string
    status?: string
    deadlineFilter?: string
    assignedUserId?: string
  }
}

export function WorksList({ works, clients, categories, users, filters }: WorksListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [clientHighlightedIndex, setClientHighlightedIndex] = useState(0)
  const clientDropdownRef = useRef<HTMLDivElement>(null)
  const clientSearchInputRef = useRef<HTMLInputElement>(null)

  const selectedClientName = useMemo(
    () => clients.find((c) => c.id === (filters.clientId || ''))?.name ?? '',
    [clients, filters.clientId]
  )

  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase()
    if (!query) return clients
    return clients.filter((client) => client.name.toLowerCase().includes(query))
  }, [clients, clientSearch])

  useEffect(() => {
    if (!clientDropdownOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (clientDropdownRef.current?.contains(e.target as Node)) return
      setClientDropdownOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [clientDropdownOpen])

  useEffect(() => {
    if (!clientDropdownOpen) return
    setClientSearch('')
    setClientHighlightedIndex(0)
    requestAnimationFrame(() => clientSearchInputRef.current?.focus())
  }, [clientDropdownOpen])

  useEffect(() => {
    setClientHighlightedIndex(0)
  }, [clientSearch])

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/works?${params.toString()}`)
  }

  const applyClientFilter = (clientId: string) => {
    updateFilter('clientId', clientId)
    setClientDropdownOpen(false)
  }

  const returnToWorks = useMemo(() => {
    const qs = searchParams.toString()
    return qs ? `/works?${qs}` : '/works'
  }, [searchParams])

  return (
    <div>
      {/* Filtri */}
      <div className="bg-dark border border-accent/20 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Cliente
            </label>
            <div className="relative" ref={clientDropdownRef}>
              <button
                type="button"
                onClick={() => setClientDropdownOpen((open) => !open)}
                className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm text-left focus:outline-none focus:ring-2 focus:ring-accent flex items-center justify-between"
                aria-haspopup="listbox"
                aria-expanded={clientDropdownOpen}
              >
                <span className={selectedClientName ? 'text-white' : 'text-white/70'}>
                  {selectedClientName || 'Tutti'}
                </span>
                <span className="text-white/60">▾</span>
              </button>

              {clientDropdownOpen && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 rounded-md border border-accent/20 bg-dark shadow-lg p-2">
                  <input
                    ref={clientSearchInputRef}
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    onKeyDown={(e) => {
                      const optionCount = filteredClients.length + 1 // include "Tutti"
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setClientHighlightedIndex((i) => Math.min(optionCount - 1, i + 1))
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setClientHighlightedIndex((i) => Math.max(0, i - 1))
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        if (clientHighlightedIndex === 0) {
                          applyClientFilter('')
                          return
                        }
                        const selected = filteredClients[clientHighlightedIndex - 1]
                        if (selected) applyClientFilter(selected.id)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setClientDropdownOpen(false)
                      }
                    }}
                    placeholder="Cerca cliente..."
                    autoComplete="off"
                    className="w-full px-3 py-2 mb-2 bg-dark border border-accent/20 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <div className="max-h-56 overflow-y-auto">
                    <button
                      type="button"
                      onMouseEnter={() => setClientHighlightedIndex(0)}
                      onClick={() => applyClientFilter('')}
                      className={`w-full text-left px-3 py-2 text-sm rounded ${
                        clientHighlightedIndex === 0 ? 'bg-accent/15 text-accent' : 'text-white hover:bg-white/10'
                      }`}
                    >
                      Tutti
                    </button>
                    {filteredClients.map((client, idx) => {
                      const isHighlighted = clientHighlightedIndex === idx + 1
                      const isActive = filters.clientId === client.id
                      return (
                        <button
                          key={client.id}
                          type="button"
                          onMouseEnter={() => setClientHighlightedIndex(idx + 1)}
                          onClick={() => applyClientFilter(client.id)}
                          className={`w-full text-left px-3 py-2 text-sm rounded ${
                            isHighlighted
                              ? 'bg-accent/15 text-accent'
                              : isActive
                                ? 'text-accent'
                                : 'text-white hover:bg-white/10'
                          }`}
                        >
                          {client.name}
                        </button>
                      )
                    })}
                    {filteredClients.length === 0 && (
                      <div className="px-3 py-2 text-sm text-white/50">Nessun cliente trovato</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Categoria
            </label>
            <select
              value={filters.categoryId || ''}
              onChange={(e) => updateFilter('categoryId', e.target.value)}
              className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Tutte</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Stato
            </label>
            <select
              value={filters.status || ''}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Tutti</option>
              {Object.entries(WORK_STATUS_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Scadenza
            </label>
            <select
              value={filters.deadlineFilter || 'TUTTI'}
              onChange={(e) => updateFilter('deadlineFilter', e.target.value)}
              className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="TUTTI">Tutti</option>
              <option value="SCADUTI">Scaduti</option>
              <option value="IN_SCADENZA_7_GIORNI">In scadenza (7 giorni)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Assegnato a
            </label>
            <select
              value={filters.assignedUserId || ''}
              onChange={(e) => updateFilter('assignedUserId', e.target.value)}
              className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Tutti</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>+ Nuovo Lavoro</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nuovo Lavoro</DialogTitle>
            </DialogHeader>
            <WorkForm
              clients={clients}
              categories={categories}
              users={users}
              onSuccess={() => setIsCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-dark border border-accent/20 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-accent/10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Titolo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Cliente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Categoria
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Stato
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Scadenza
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Assegnato a
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-accent uppercase">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {works.map((work) => {
              const isExpired = work.deadline && new Date(work.deadline) < new Date() && work.status !== 'DONE'
              return (
                <tr key={work.id} className="hover:bg-white/5">
                  <td className="px-6 py-4 text-white">{work.title}</td>
                  <td className="px-6 py-4 text-white/70">{work.client.name}</td>
                  <td className="px-6 py-4 text-white/70">{work.category.name}</td>
                  <td className="px-6 py-4">
                    <WorkStatusBadge status={work.status} />
                  </td>
                  <td className="px-6 py-4">
                    {work.deadline ? (
                      <span className={isExpired ? 'text-red-400' : 'text-white/70'}>
                        {format(new Date(work.deadline), 'dd MMM yyyy', { locale: it })}
                        {isExpired && <span className="ml-2 text-xs text-red-400">Scaduto</span>}
                      </span>
                    ) : (
                      <span className="text-white/50">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-white/70">
                    {work.assignedTo?.name || '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/works/${work.id}?returnTo=${encodeURIComponent(returnToWorks)}`}
                      className="text-accent hover:underline text-sm"
                    >
                      Dettagli
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {works.length === 0 && (
          <div className="p-12 text-center text-white/50">
            Nessun lavoro trovato
          </div>
        )}
      </div>
    </div>
  )
}

