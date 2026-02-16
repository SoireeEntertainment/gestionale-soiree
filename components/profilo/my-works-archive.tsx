'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Work, Client, Category } from '@prisma/client'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'

type WorkWithRelations = Work & { client: Client; category: Category }

const statusLabels: Record<string, string> = {
  DONE: 'Completato',
  CANCELED: 'Annullato',
}

type MyWorksArchiveProps = {
  works: WorkWithRelations[]
  clients: { id: string; name: string }[]
  categories: { id: string; name: string }[]
}

export function MyWorksArchive({ works, clients, categories }: MyWorksArchiveProps) {
  const [clientFilter, setClientFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const filtered = works.filter((w) => {
    if (clientFilter && w.clientId !== clientFilter) return false
    if (categoryFilter && w.categoryId !== categoryFilter) return false
    return true
  })

  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-semibold text-white mb-4">Archivio (lavori chiusi)</h2>

      <div className="flex flex-wrap gap-4 mb-4">
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm"
          style={{ backgroundColor: 'var(--dark)', color: '#fff', border: '1px solid rgba(16,249,199,0.2)', borderRadius: '6px', padding: '8px 12px' }}
        >
          <option value="">Cliente: tutti</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
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
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-accent/10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-accent uppercase">Lavoro / Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-accent uppercase">Stato</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-accent uppercase">Chiuso il</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-accent uppercase">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filtered.map((w) => (
              <tr key={w.id} className="hover:bg-white/5">
                <td className="px-4 py-3">
                  <Link href={`/works/${w.id}`} className="text-accent hover:underline font-medium">
                    {w.title}
                  </Link>
                  <div className="text-white/60 text-sm">{w.client.name} · {w.category.name}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 text-xs rounded bg-white/10 text-white/80">
                    {statusLabels[w.status] ?? w.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/70 text-sm">
                  {format(new Date(w.updatedAt), 'dd MMM yyyy', { locale: it })}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/works/${w.id}`}>
                    <Button variant="ghost" size="sm">Apri</Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-white/50">
          Nessun lavoro chiuso (o nessun risultato con i filtri).
        </div>
      )}
    </div>
  )
}
