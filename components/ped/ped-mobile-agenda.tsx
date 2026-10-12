'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, SlidersHorizontal } from 'lucide-react'
import { addDaysToDateString, getISOWeekStartKey, PED_ITEM_TYPE_LABELS } from '@/lib/ped-utils'
import { getEffectiveLabel, PED_LABEL_CONFIG, PED_LABELS, type PedLabel } from '@/lib/pedLabels'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PedItem = {
  id: string
  date: string
  clientId: string
  kind: string
  type: string
  title: string
  description?: string | null
  priority?: string
  label?: string | null
  status: string
  workId?: string | null
  isExtra?: boolean
  assignedToUserId?: string | null
  assignedTo?: { id: string; name: string } | null
  client: { id: string; name: string }
  work?: { id: string; title: string } | null
  shootingReelId?: string | null
  shootingReel?: {
    id: string
    topic: string
    published: boolean
    shooting: {
      id: string
      name: string
      date: string | Date
      location: string | null
    }
  } | null
}

const DAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

function pedWeekQuery(weekStart: string, userId?: string | null): string {
  const params = new URLSearchParams({ week: weekStart })
  if (userId) params.set('userId', userId)
  return `/ped?${params.toString()}`
}

function formatWeekRange(weekStart: string): string {
  const end = addDaysToDateString(weekStart, 6)
  const startDate = parseISO(weekStart)
  const endDate = parseISO(end)
  return `${format(startDate, 'd MMM', { locale: it })} – ${format(endDate, 'd MMM', { locale: it })}`
}

export function PedMobileAgenda({
  weekStart,
  viewAsUserId,
  viewAsUserName,
  items,
  readOnly,
  filterClientId,
  filterType,
  clients,
  onFilterClientChange,
  onFilterTypeChange,
  onOpenAdd,
  onOpenAddExtra,
  onOpenEdit,
  onToggleDone,
  onSetLabel,
  onMoveItem,
  onDuplicateItem,
  onDeleteItem,
}: {
  weekStart: string
  viewAsUserId?: string | null
  viewAsUserName: string
  items: PedItem[]
  readOnly: boolean
  filterClientId: string
  filterType: string
  clients: { id: string; name: string }[]
  onFilterClientChange: (id: string) => void
  onFilterTypeChange: (type: string) => void
  onOpenAdd: (dateKey: string) => void
  onOpenAddExtra: (weekStartDateKey: string) => void
  onOpenEdit: (item: PedItem) => void
  onToggleDone: (id: string) => void
  onSetLabel: (id: string, label: PedLabel) => void
  onMoveItem: (itemId: string, targetDate: string, targetIsExtra: boolean) => void
  onDuplicateItem: (itemId: string, targetDate: string, targetIsExtra: boolean) => void
  onDeleteItem: (itemId: string) => void
}) {
  const [menuItem, setMenuItem] = useState<PedItem | null>(null)
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveDate, setMoveDate] = useState('')
  const [moveExtra, setMoveExtra] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const dayKeys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysToDateString(weekStart, i)),
    [weekStart]
  )

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterClientId && item.clientId !== filterClientId) return false
      if (filterType && item.type !== filterType) return false
      return true
    })
  }, [items, filterClientId, filterType])

  const itemsByDay = useMemo(() => {
    const map: Record<string, PedItem[]> = {}
    for (const key of dayKeys) map[key] = []
    const extras: PedItem[] = []
    for (const item of filteredItems) {
      const dateKey = item.date.slice(0, 10)
      if (item.isExtra) {
        if (getISOWeekStartKey(dateKey) === weekStart) extras.push(item)
        continue
      }
      if (map[dateKey]) map[dateKey].push(item)
    }
    return { map, extras }
  }, [filteredItems, dayKeys, weekStart])

  const activeFilterCount = (filterClientId ? 1 : 0) + (filterType ? 1 : 0)
  const prevWeek = addDaysToDateString(weekStart, -7)
  const nextWeek = addDaysToDateString(weekStart, 7)
  const todayWeek = getISOWeekStartKey(new Date().toISOString().slice(0, 10))

  const closeMenus = () => {
    setMenuItem(null)
    setLabelPickerOpen(false)
    setMoveOpen(false)
  }

  const openMove = (item: PedItem) => {
    setMenuItem(item)
    setMoveDate(item.isExtra ? weekStart : item.date.slice(0, 10))
    setMoveExtra(Boolean(item.isExtra))
    setMoveOpen(true)
  }

  return (
    <div className="md:hidden space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white break-words">PED di {viewAsUserName}</h2>
        <div className="mt-3 flex items-center gap-2">
          <Link
            href={pedWeekQuery(prevWeek, viewAsUserId)}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-accent/20 text-white"
            aria-label="Settimana precedente"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1 text-center text-sm font-medium text-white/90 capitalize">
            {formatWeekRange(weekStart)}
          </div>
          <Link
            href={pedWeekQuery(nextWeek, viewAsUserId)}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-accent/20 text-white"
            aria-label="Settimana successiva"
          >
            <ChevronRight className="h-5 w-5" />
          </Link>
          <Link
            href={pedWeekQuery(todayWeek, viewAsUserId)}
            className="flex h-11 items-center rounded-lg border border-accent/30 bg-accent/10 px-3 text-sm font-medium text-accent"
          >
            Oggi
          </Link>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setFiltersOpen(true)}
        className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-lg border border-accent/20 bg-dark text-sm font-medium text-white"
      >
        <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden />
        Filtri
        {activeFilterCount > 0 && (
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">
            {activeFilterCount}
          </span>
        )}
      </button>

      {filterClientId ? (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent">
            {clients.find((c) => c.id === filterClientId)?.name ?? 'Cliente'}
          </span>
        </div>
      ) : null}

      <div className="space-y-5">
        {dayKeys.map((dateKey, idx) => {
          const dayItems = itemsByDay.map[dateKey] ?? []
          return (
            <section key={dateKey}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">
                  {DAY_NAMES[idx]}{' '}
                  <span className="font-normal text-white/55">
                    {format(parseISO(dateKey), 'd MMM', { locale: it })}
                  </span>
                </h3>
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={`Aggiungi task ${DAY_NAMES[idx]}`}
                    onClick={() => onOpenAdd(dateKey)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/25 text-accent"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {dayItems.map((item) => (
                  <MobileTaskCard
                    key={item.id}
                    item={item}
                    readOnly={readOnly}
                    onOpenEdit={onOpenEdit}
                    onToggleDone={onToggleDone}
                    onOpenMenu={() => setMenuItem(item)}
                  />
                ))}
                {dayItems.length === 0 && (
                  <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-sm text-white/40">
                    Nessun task
                  </p>
                )}
              </div>
            </section>
          )
        })}

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Extra</h3>
            {!readOnly && (
              <button
                type="button"
                aria-label="Aggiungi task Extra"
                onClick={() => onOpenAddExtra(weekStart)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/25 text-accent"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className="space-y-2">
            {itemsByDay.extras.map((item) => (
              <MobileTaskCard
                key={item.id}
                item={item}
                readOnly={readOnly}
                onOpenEdit={onOpenEdit}
                onToggleDone={onToggleDone}
                onOpenMenu={() => setMenuItem(item)}
              />
            ))}
            {itemsByDay.extras.length === 0 && (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-sm text-white/40">
                Nessun task extra
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Action menu */}
      <Dialog
        open={!!menuItem && !labelPickerOpen && !moveOpen}
        onOpenChange={(open) => {
          if (!open) closeMenus()
        }}
      >
        <DialogContent
          className="fixed inset-x-0 bottom-0 left-0 top-auto z-50 flex w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-t-2xl rounded-b-none border border-accent/20 border-b-0 bg-dark p-0"
        >
          <div
            className="px-5 pb-4 pt-3"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
            <DialogHeader className="mb-3 text-left">
              <DialogTitle className="truncate text-base">{menuItem?.title ?? 'Azioni'}</DialogTitle>
              <DialogDescription>Azioni sul task PED</DialogDescription>
            </DialogHeader>
            {menuItem && (
              <div className="flex flex-col gap-1">
                <ActionBtn
                  onClick={() => {
                    onOpenEdit(menuItem)
                    closeMenus()
                  }}
                >
                  Modifica
                </ActionBtn>
                <ActionBtn
                  onClick={() => {
                    setLabelPickerOpen(true)
                  }}
                >
                  Cambia etichetta
                </ActionBtn>
                <ActionBtn
                  onClick={() => {
                    onToggleDone(menuItem.id)
                    closeMenus()
                  }}
                >
                  {menuItem.status === 'DONE' ? 'Non fatto' : 'Fatto'}
                </ActionBtn>
                <ActionBtn
                  onClick={() => {
                    onDuplicateItem(menuItem.id, menuItem.date.slice(0, 10), Boolean(menuItem.isExtra))
                    closeMenus()
                  }}
                >
                  Duplica
                </ActionBtn>
                <ActionBtn onClick={() => openMove(menuItem)}>Sposta</ActionBtn>
                <ActionBtn
                  danger
                  onClick={() => {
                    onDeleteItem(menuItem.id)
                    closeMenus()
                  }}
                >
                  Elimina
                </ActionBtn>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Label picker */}
      <Dialog open={labelPickerOpen} onOpenChange={(open) => !open && closeMenus()}>
        <DialogContent
          className="fixed inset-x-0 bottom-0 left-0 top-auto z-50 flex w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-t-2xl rounded-b-none border border-accent/20 border-b-0 bg-dark p-0"
        >
          <div
            className="px-5 pb-4 pt-3"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <DialogHeader className="mb-3 text-left">
              <DialogTitle>Cambia etichetta</DialogTitle>
              <DialogDescription>Seleziona lo stato del task</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1">
              {PED_LABELS.map((labelKey) => {
                const config = PED_LABEL_CONFIG[labelKey]
                return (
                  <button
                    key={labelKey}
                    type="button"
                    className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-left text-sm text-white hover:bg-white/5"
                    onClick={() => {
                      if (menuItem) onSetLabel(menuItem.id, labelKey)
                      closeMenus()
                    }}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: config.backgroundColor }}
                    />
                    {config.label}
                  </button>
                )
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog open={moveOpen} onOpenChange={(open) => !open && closeMenus()}>
        <DialogContent
          className="fixed inset-x-0 bottom-0 left-0 top-auto z-50 flex w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-t-2xl rounded-b-none border border-accent/20 border-b-0 bg-dark p-0"
        >
          <div
            className="px-5 pb-4 pt-3"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <DialogHeader className="mb-3 text-left">
              <DialogTitle>Sposta task</DialogTitle>
              <DialogDescription>Scegli data destinazione o Extra</DialogDescription>
            </DialogHeader>
            <label className="block text-sm text-white/70 mb-1">Data destinazione</label>
            <input
              type="date"
              value={moveDate}
              onChange={(e) => setMoveDate(e.target.value)}
              disabled={moveExtra}
              className="mb-3 w-full rounded-md border border-accent/20 bg-dark px-3 py-3 text-white"
            />
            <label className="mb-4 flex min-h-[44px] items-center gap-3 text-sm text-white">
              <input
                type="checkbox"
                checked={moveExtra}
                onChange={(e) => setMoveExtra(e.target.checked)}
                className="h-5 w-5 accent-[var(--accent)]"
              />
              Sposta in Extra (settimana corrente)
            </label>
            <Button
              className="w-full min-h-[48px]"
              onClick={() => {
                if (!menuItem) return
                const targetDate = moveExtra ? weekStart : moveDate
                if (!targetDate) return
                onMoveItem(menuItem.id, targetDate, moveExtra)
                closeMenus()
              }}
            >
              Salva
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters sheet */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent
          className="fixed inset-x-0 bottom-0 left-0 top-auto z-50 flex w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-t-2xl rounded-b-none border border-accent/20 border-b-0 bg-dark p-0"
        >
          <div
            className="px-5 pb-4 pt-3"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <DialogHeader className="mb-3 text-left">
              <DialogTitle>Filtri PED</DialogTitle>
              <DialogDescription>Filtra per cliente e tipologia</DialogDescription>
            </DialogHeader>
            <label className="block text-sm text-white mb-1">Cliente</label>
            <select
              value={filterClientId}
              onChange={(e) => onFilterClientChange(e.target.value)}
              className="mb-3 w-full rounded-md border border-accent/20 bg-dark px-3 py-3 text-white"
            >
              <option value="">Tutti</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="block text-sm text-white mb-1">Tipologia</label>
            <select
              value={filterType}
              onChange={(e) => onFilterTypeChange(e.target.value)}
              className="mb-4 w-full rounded-md border border-accent/20 bg-dark px-3 py-3 text-white"
            >
              <option value="">Tutte</option>
              {Object.entries(PED_ITEM_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button className="w-full min-h-[48px]" onClick={() => setFiltersOpen(false)}>
              Applica
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ActionBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[48px] items-center rounded-xl px-3 text-left text-[15px]',
        danger ? 'text-red-300 hover:bg-red-500/10' : 'text-white hover:bg-white/5'
      )}
    >
      {children}
    </button>
  )
}

function MobileTaskCard({
  item,
  readOnly,
  onOpenEdit,
  onToggleDone,
  onOpenMenu,
}: {
  item: PedItem
  readOnly: boolean
  onOpenEdit: (item: PedItem) => void
  onToggleDone: (id: string) => void
  onOpenMenu: () => void
}) {
  const label = getEffectiveLabel(item)
  const labelConfig = PED_LABEL_CONFIG[label]
  const typeLabel = PED_ITEM_TYPE_LABELS[item.type] ?? item.type
  const isShooting = item.type === 'SHOOTING' || Boolean(item.shootingReelId)

  return (
    <div className="rounded-xl border border-accent/20 bg-dark/80 p-3 min-w-0">
      <div className="flex items-start gap-2">
        {!readOnly && (
          <label className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={item.status === 'DONE'}
              onChange={() => onToggleDone(item.id)}
              className="h-5 w-5 accent-[var(--accent)]"
              aria-label={item.status === 'DONE' ? 'Segna non fatto' : 'Segna fatto'}
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => onOpenEdit(item)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="text-sm font-medium text-white/90 break-words">{item.client.name}</p>
          <p className="text-xs text-white/50">{typeLabel}</p>
          <p className="mt-1 text-[15px] font-semibold text-white break-words">{item.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className="rounded px-2 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: labelConfig.backgroundColor, color: labelConfig.color }}
            >
              {labelConfig.label}
            </span>
            {isShooting && (
              <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/80">
                🎥 Shooting
              </span>
            )}
            {item.assignedTo && item.assignedToUserId && (
              <span className="rounded bg-violet-600/40 px-2 py-0.5 text-[11px] text-white/90">
                {item.assignedTo.name}
              </span>
            )}
          </div>
        </button>
        {!readOnly && (
          <button
            type="button"
            aria-label="Azioni task"
            onClick={onOpenMenu}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/5"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
}
