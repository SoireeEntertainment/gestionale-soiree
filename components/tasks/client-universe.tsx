'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BOARD_EASE,
  UNIVERSE_ORBIT_PAGE_SIZE,
  filterUniverseNodesByQuery,
  paginateUniverseNodes,
  type UniverseClientNode,
} from '@/lib/daily-tasks'
import { cn } from '@/lib/utils'

function statusColor(status: UniverseClientNode['status']) {
  if (status === 'red') {
    return {
      glow: 'rgba(248,113,113,0.45)',
      ring: 'border-red-400/60',
      text: 'text-red-200',
      bg: 'bg-red-500/15',
    }
  }
  if (status === 'green') {
    return {
      glow: 'rgba(52,211,153,0.4)',
      ring: 'border-emerald-400/55',
      text: 'text-emerald-200',
      bg: 'bg-emerald-500/15',
    }
  }
  return {
    glow: 'rgba(148,163,184,0.25)',
    ring: 'border-white/20',
    text: 'text-white/55',
    bg: 'bg-white/[0.06]',
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

export function ClientUniverse({
  nodes,
  onMarkContacted,
  onOpenTask,
}: {
  nodes: UniverseClientNode[]
  onMarkContacted: (node: UniverseClientNode) => void
  onOpenTask: (node: UniverseClientNode) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'red' | 'green' | 'neutral'>('ALL')
  const [page, setPage] = useState(0)

  const counts = useMemo(
    () => ({
      red: nodes.filter((n) => n.status === 'red').length,
      green: nodes.filter((n) => n.status === 'green').length,
      neutral: nodes.filter((n) => n.status === 'neutral').length,
      total: nodes.length,
    }),
    [nodes]
  )

  const filtered = useMemo(() => {
    let list = filterUniverseNodesByQuery(nodes, query)
    if (statusFilter !== 'ALL') list = list.filter((n) => n.status === statusFilter)
    return list
  }, [nodes, query, statusFilter])

  useEffect(() => {
    setPage(0)
  }, [query, statusFilter, nodes.length])

  const { pageNodes, page: safePage, totalPages } = useMemo(
    () => paginateUniverseNodes(filtered, page, UNIVERSE_ORBIT_PAGE_SIZE),
    [filtered, page]
  )

  const selected = nodes.find((n) => n.clientId === selectedId) ?? null

  const positioned = useMemo(() => {
    const count = pageNodes.length
    return pageNodes.map((node, index) => {
      const angle = (index / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2
      const ring = index % 3
      const radius = 34 + ring * 14
      const x = 50 + Math.cos(angle) * radius
      const y = 50 + Math.sin(angle) * (radius * 0.72)
      return { node, x, y }
    })
  }, [pageNodes])

  return (
    <section className="rounded-2xl border border-accent/15 bg-[#0d1014] p-4 md:p-6 overflow-hidden relative">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 50% 45% at 50% 48%, rgba(45,212,191,0.12), transparent 70%)',
        }}
      />

      <div className="relative mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Universo clienti</h2>
          <p className="text-xs text-white/45 mt-0.5">
            Rosso = da sentire · Verde = sentito in attesa di riattivazione
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-red-200">
            Da sentire {counts.red}
          </span>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">
            Sentiti {counts.green}
          </span>
          <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-white/55">
            Totale {counts.total}
          </span>
        </div>
      </div>

      <div className="relative mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca cliente nell’universo…"
          className="min-h-[40px] rounded-md border border-accent/20 bg-[#101317] px-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="min-h-[40px] rounded-md border border-accent/20 bg-[#101317] px-2 text-xs text-white"
        >
          <option value="ALL">Tutti gli stati</option>
          <option value="red">Solo da sentire</option>
          <option value="green">Solo sentiti</option>
          <option value="neutral">Senza tracker</option>
        </select>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="min-h-[40px] rounded-md border border-white/15 px-3 text-xs text-white/70 disabled:opacity-40"
          >
            ←
          </button>
          <span className="text-[11px] text-white/45 tabular-nums whitespace-nowrap">
            {safePage + 1}/{totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="min-h-[40px] rounded-md border border-white/15 px-3 text-xs text-white/70 disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>

      <div className="relative mx-auto aspect-[4/3] w-full max-w-3xl md:aspect-[16/10]">
        <div className="absolute left-1/2 top-1/2 h-[58%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-accent/15" />
        <div className="absolute left-1/2 top-1/2 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-accent/10" />
        <div className="absolute left-1/2 top-1/2 h-[96%] w-[96%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/5" />

        <div
          className="absolute left-1/2 top-1/2 z-10 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-accent/40 bg-[#12161c] md:h-24 md:w-24"
          style={{
            boxShadow: '0 0 40px rgba(45,212,191,0.28), inset 0 0 20px rgba(45,212,191,0.08)',
            transitionTimingFunction: BOARD_EASE,
          }}
        >
          <span className="mb-1 flex gap-1.5" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
          </span>
          <span className="text-[10px] font-semibold tracking-[0.14em] text-accent md:text-[11px]">
            SOIRËE
          </span>
        </div>

        {positioned.map(({ node, x, y }) => {
          const colors = statusColor(node.status)
          const isSelected = selectedId === node.clientId
          return (
            <button
              key={node.clientId}
              type="button"
              title={node.clientName}
              onClick={() => setSelectedId(isSelected ? null : node.clientId)}
              className={cn(
                'absolute z-[5] max-w-[110px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border px-2.5 py-1 text-[10px] font-medium md:text-[11px]',
                'transition-[transform,box-shadow,border-color] duration-300',
                colors.ring,
                colors.bg,
                colors.text,
                isSelected && 'z-20 scale-110'
              )}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                boxShadow: isSelected ? `0 0 18px ${colors.glow}` : `0 0 10px ${colors.glow}`,
                transitionTimingFunction: BOARD_EASE,
              }}
            >
              {node.clientName}
            </button>
          )
        })}

        {filtered.length === 0 && (
          <p className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-sm text-white/40">
            Nessun cliente corrisponde ai filtri
          </p>
        )}
      </div>

      {filtered.length > UNIVERSE_ORBIT_PAGE_SIZE && (
        <p className="relative mt-2 text-center text-[11px] text-white/40">
          Mostrati {pageNodes.length} di {filtered.length} clienti filtrati — usa ricerca o le frecce
          per raggiungere tutti.
        </p>
      )}

      {selected && (
        <div
          className="relative mt-4 rounded-xl border border-accent/20 bg-white/[0.03] p-4"
          style={{ transitionTimingFunction: BOARD_EASE }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-base font-semibold text-white">{selected.clientName}</p>
              <p className="mt-1 text-xs text-white/50">
                Stato:{' '}
                <span className={statusColor(selected.status).text}>
                  {selected.status === 'red'
                    ? 'Da sentire'
                    : selected.status === 'green'
                      ? 'Sentito'
                      : 'Nessun tracker'}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-white/45">
                Ultimo contatto: {formatDate(selected.lastContactedAt)}
              </p>
              <p className="text-xs text-white/45">
                Prossima riattivazione: {formatDate(selected.nextReactivateAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.status !== 'green' && (
                <button
                  type="button"
                  onClick={() => onMarkContacted(selected)}
                  className="min-h-[40px] rounded-md bg-accent px-3 text-sm font-medium text-dark hover:bg-accent/90"
                >
                  Segna sentito
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenTask(selected)}
                className="min-h-[40px] rounded-md border border-accent px-3 text-sm font-medium text-accent hover:bg-accent/10"
              >
                {selected.taskId ? 'Apri task' : 'Crea Sentire'}
              </button>
              <Link
                href={`/clients/${selected.clientId}`}
                className="inline-flex min-h-[40px] items-center rounded-md border border-white/15 px-3 text-sm font-medium text-white/80 hover:border-accent/40 hover:text-white"
              >
                Apri cliente
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
