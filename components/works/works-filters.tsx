'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Client, Category, User } from '@prisma/client'
import { WORK_STATUS_META } from '@/lib/work-status'

export type WorksFiltersState = {
  clientId?: string
  categoryId?: string
  status?: string
  deadlineFilter?: string
  assignedUserId?: string
}

interface WorksFiltersProps {
  clients: Client[]
  categories: Category[]
  users: User[]
  filters: WorksFiltersState
}

export function WorksFilters({ clients, categories, users, filters }: WorksFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
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
    if (value && value !== 'TUTTI') params.set(key, value)
    else params.delete(key)
    router.push(`/works?${params.toString()}`)
  }

  const applyClientFilter = (clientId: string) => {
    updateFilter('clientId', clientId)
    setClientDropdownOpen(false)
  }

  return (
    <div className="bg-dark border border-accent/20 rounded-lg p-4 mb-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1">Cliente</label>
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
                    const optionCount = filteredClients.length + 1
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setClientHighlightedIndex((i) => Math.min(optionCount - 1, i + 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setClientHighlightedIndex((i) => Math.max(0, i - 1))
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      if (clientHighlightedIndex === 0) applyClientFilter('')
                      else {
                        const selected = filteredClients[clientHighlightedIndex - 1]
                        if (selected) applyClientFilter(selected.id)
                      }
                    } else if (e.key === 'Escape') {
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
                  {filteredClients.map((client, idx) => (
                    <button
                      key={client.id}
                      type="button"
                      onMouseEnter={() => setClientHighlightedIndex(idx + 1)}
                      onClick={() => applyClientFilter(client.id)}
                      className={`w-full text-left px-3 py-2 text-sm rounded ${
                        clientHighlightedIndex === idx + 1
                          ? 'bg-accent/15 text-accent'
                          : filters.clientId === client.id
                            ? 'text-accent'
                            : 'text-white hover:bg-white/10'
                      }`}
                    >
                      {client.name}
                    </button>
                  ))}
                  {filteredClients.length === 0 && (
                    <div className="px-3 py-2 text-sm text-white/50">Nessun cliente trovato</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-white mb-1">Categoria</label>
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
          <label className="block text-sm font-medium text-white mb-1">Stato</label>
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
          <label className="block text-sm font-medium text-white mb-1">Scadenza</label>
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
          <label className="block text-sm font-medium text-white mb-1">Assegnato a</label>
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
  )
}
