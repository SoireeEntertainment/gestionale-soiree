'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { PedCalendar } from '@/components/ped/ped-calendar'
import { PedItemModal } from '@/components/ped/ped-item-modal'
import { getPedMonthForClient } from '@/app/actions/ped'
import {
  togglePedItemDone,
  updatePedItem,
  duplicatePedItem,
  deletePedItem,
  reorderPedItemsInDay,
  upsertPedClientSetting,
  fillPedMonthForClient,
  emptyPedMonthForClient,
  createPedItem,
} from '@/app/actions/ped'
import { getISOWeekStart, toDateString, contentsPerWeekToContentsPerMonth } from '@/lib/ped-utils'

function getISOWeekStartKey(dateKey: string): string {
  return toDateString(getISOWeekStart(new Date(dateKey + 'T00:00:00.000Z')))
}

type UndoEntry =
  | { type: 'move'; itemId: string; date: string; isExtra: boolean }
  | { type: 'reorder'; dateKey: string; isExtra: boolean; orderedItemIds: string[] }
  | { type: 'toggleDone'; itemId: string; previousStatus: string }
  | { type: 'delete'; item: { clientId: string; date: string; kind: string; type: string; title: string; description?: string | null; priority: string; status: string; workId?: string | null; isExtra?: boolean; assignedToUserId?: string | null } }

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

type Client = { id: string; name: string }
type Work = { id: string; title: string }
type PedItem = {
  id: string
  date: string
  clientId: string
  ownerId?: string
  kind: string
  type: string
  title: string
  description?: string | null
  priority: string
  status: string
  workId?: string | null
  isExtra?: boolean
  assignedToUserId?: string | null
  assignedTo?: { id: string; name: string } | null
  owner?: { id: string; name: string } | null
  client: { id: string; name: string }
  work?: { id: string; title: string } | null
}

type PedClientSettingWithOwner = {
  id: string
  clientId: string
  contentsPerWeek: number
  ownerId: string
  owner: { id: string; name: string }
}

type PedData = {
  pedItems: PedItem[]
  pedClientSettings: PedClientSettingWithOwner[]
  computedStats: {
    dailyStats: Record<string, { total: number; done: number; remainingPct: number }>
    weeklyStats: { weekStart: string; weekEnd: string; total: number; done: number }[]
    monthlyStats: { total: number; done: number }
  }
}

function abbreviateOwnerId(id: string): string {
  return id.length > 10 ? id.slice(0, 8) + '…' : id
}

type User = { id: string; name: string }

export function ClientPedSection({
  clientId,
  clientName,
  clients,
  works,
  canWrite = true,
  initialContentsPerMonth = 0,
  users,
  currentUserId,
}: {
  clientId: string
  clientName: string
  clients: Client[]
  works: Work[]
  canWrite?: boolean
  initialContentsPerMonth?: number
  users: User[]
  currentUserId: string
}) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<PedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [contentsPerMonth, setContentsPerMonth] = useState(initialContentsPerMonth)
  const [savingContents, setSavingContents] = useState(false)
  const [filling, setFilling] = useState(false)
  const [emptying, setEmptying] = useState(false)
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null)
  const [undoing, setUndoing] = useState(false)

  useEffect(() => {
    setContentsPerMonth(initialContentsPerMonth)
  }, [initialContentsPerMonth])

  const handleContentsPerMonthChange = async (value: number) => {
    const n = Math.max(0, Math.min(99, Math.round(value)))
    setContentsPerMonth(n)
    if (!canWrite) return
    setSavingContents(true)
    try {
      await upsertPedClientSetting(clientId, n)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSavingContents(false)
    }
  }

  const handleFillMonth = async () => {
    setFilling(true)
    try {
      await fillPedMonthForClient(clientId, year, month)
      await refetch()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    } finally {
      setFilling(false)
    }
  }

  const handleEmptyMonth = async () => {
    if (!confirm('Svuotare tutte le task di questo cliente nel mese? Questa azione non si può annullare.')) return
    setEmptying(true)
    try {
      await emptyPedMonthForClient(clientId, year, month)
      await refetch()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    } finally {
      setEmptying(false)
    }
  }

  const [modalOpen, setModalOpen] = useState(false)
  const [modalDateKey, setModalDateKey] = useState<string | null>(null)
  const [modalEditItem, setModalEditItem] = useState<PedItem | null>(null)
  const [modalIsExtra, setModalIsExtra] = useState(false)
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)

  const refetch = async () => {
    setLoading(true)
    try {
      const result = await getPedMonthForClient(clientId, year, month)
      const pedItems = result.pedItems.map((item) => ({
        ...item,
        date: typeof item.date === 'string' ? item.date : (item.date as unknown as Date).toISOString?.()?.slice(0, 10) ?? '',
      }))
      setData({ ...result, pedItems })
    } catch (e) {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getPedMonthForClient(clientId, year, month)
      .then((result) => {
        if (cancelled) return
        const pedItems = result.pedItems.map((item) => ({
          ...item,
          date: typeof item.date === 'string' ? item.date : (item.date as unknown as Date).toISOString?.()?.slice(0, 10) ?? '',
        }))
        setData({ ...result, pedItems })
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [clientId, year, month])

  const itemsWithDateString = useMemo(() => data?.pedItems ?? [], [data])

  const handleOpenAdd = (dateKey: string) => {
    setSelectedDateKey(dateKey)
    setModalDateKey(dateKey)
    setModalEditItem(null)
    setModalIsExtra(false)
    setModalOpen(true)
  }

  const handleOpenAddExtra = (weekStartDateKey: string) => {
    setModalDateKey(weekStartDateKey)
    setModalEditItem(null)
    setModalIsExtra(true)
    setModalOpen(true)
  }

  const handleOpenEdit = (item: PedItem) => {
    const dateStr = typeof item.date === 'string' ? item.date.slice(0, 10) : (item.date as unknown as Date).toISOString?.()?.slice(0, 10) ?? ''
    setSelectedDateKey(dateStr)
    setModalDateKey(dateStr)
    setModalEditItem({ ...item, date: dateStr })
    setModalIsExtra(Boolean(item.isExtra))
    setModalOpen(true)
  }

  const handleToggleDone = async (id: string) => {
    const item = itemsWithDateString.find((i) => i.id === id)
    if (item) setUndoEntry({ type: 'toggleDone', itemId: id, previousStatus: item.status })
    const result = await togglePedItemDone(id)
    if (result.ok) {
      await refetch()
    } else {
      if (item) setUndoEntry(null)
      alert(result.error ?? 'Errore')
    }
  }

  const handleMoveItem = async (itemId: string, targetDate: string, targetIsExtra: boolean) => {
    const item = itemsWithDateString.find((i) => i.id === itemId)
    const dateStr = item?.date?.slice(0, 10)
    if (item && dateStr != null) setUndoEntry({ type: 'move', itemId, date: dateStr, isExtra: Boolean(item.isExtra) })
    try {
      if (typeof updatePedItem !== 'function') {
        alert('Errore: azione non disponibile. Ricarica la pagina.')
        return
      }
      await updatePedItem(itemId, { date: targetDate, isExtra: targetIsExtra })
      await refetch()
    } catch (e) {
      setUndoEntry(null)
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const handleDuplicateItem = async (itemId: string, targetDate: string, targetIsExtra: boolean) => {
    try {
      await duplicatePedItem(itemId, targetDate, targetIsExtra)
      await refetch()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    const item = itemsWithDateString.find((i) => i.id === itemId)
    if (item) {
      const dateStr = typeof item.date === 'string' ? item.date.slice(0, 10) : ''
      setUndoEntry({
        type: 'delete',
        item: {
          clientId: item.clientId,
          date: dateStr,
          kind: item.kind,
          type: item.type,
          title: item.title,
          description: item.description ?? null,
          priority: item.priority,
          status: item.status,
          workId: item.workId ?? null,
          isExtra: item.isExtra,
          assignedToUserId: item.assignedToUserId ?? null,
        },
      })
    }
    try {
      await deletePedItem(itemId)
      await refetch()
    } catch (e) {
      setUndoEntry(null)
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const getCurrentOrderForDay = (dateKey: string, isExtra: boolean): string[] => {
    if (isExtra) {
      return itemsWithDateString.filter((i) => getISOWeekStartKey(i.date.slice(0, 10)) === dateKey && i.isExtra).map((i) => i.id)
    }
    return itemsWithDateString.filter((i) => i.date.slice(0, 10) === dateKey && !i.isExtra).map((i) => i.id)
  }

  const handleReorderInDay = async (dateKey: string, isExtra: boolean, orderedItemIds: string[]) => {
    const previousOrder = getCurrentOrderForDay(dateKey, isExtra)
    setUndoEntry({ type: 'reorder', dateKey, isExtra, orderedItemIds: previousOrder })
    try {
      await reorderPedItemsInDay(dateKey, isExtra, orderedItemIds)
      await refetch()
    } catch (e) {
      setUndoEntry(null)
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const handleUndo = async () => {
    if (!undoEntry) return
    setUndoing(true)
    try {
      switch (undoEntry.type) {
        case 'move':
          await updatePedItem(undoEntry.itemId, { date: undoEntry.date, isExtra: undoEntry.isExtra })
          break
        case 'reorder':
          await reorderPedItemsInDay(undoEntry.dateKey, undoEntry.isExtra, undoEntry.orderedItemIds)
          break
        case 'toggleDone':
          await updatePedItem(undoEntry.itemId, { status: undoEntry.previousStatus })
          break
        case 'delete':
          await createPedItem(undoEntry.item)
          break
      }
      setUndoEntry(null)
      await refetch()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    } finally {
      setUndoing(false)
    }
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setModalDateKey(null)
    setModalEditItem(null)
    setModalIsExtra(false)
  }

  const prevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else {
      setMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`

  if (loading && !data) {
    return (
      <div className="bg-dark border border-accent/20 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-white mb-4">PED · {clientName}</h2>
        <p className="text-white/60">Caricamento calendario...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-dark border border-accent/20 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-white mb-4">PED · {clientName}</h2>
        <p className="text-white/60">Impossibile caricare il calendario.</p>
      </div>
    )
  }

  return (
    <div className="bg-dark border border-accent/20 rounded-lg p-6 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <h2 className="text-xl font-bold text-white">PED · {clientName}</h2>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={prevMonth}>← Mese precedente</Button>
            <span className="text-white/90 font-medium min-w-[140px] text-center text-sm">{monthLabel}</span>
            <Button variant="ghost" size="sm" onClick={nextMonth}>Mese successivo →</Button>
          </div>
          {canWrite && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleFillMonth}
                disabled={filling}
              >
                {filling ? 'In corso…' : 'Riempi mese'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleEmptyMonth}
                disabled={emptying}
              >
                {emptying ? 'In corso…' : 'Svuota mese'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleUndo}
                disabled={!undoEntry || undoing}
              >
                {undoing ? 'Annullamento…' : 'Annulla ultima azione'}
              </Button>
            </div>
          )}
        </div>
      </div>
      {/* Target contenuti/mese: tutti gli owner (visibile anche se il cliente non è nel mio PED) */}
      <div className="mb-4 p-3 rounded-lg bg-white/5 border border-accent/20">
        <h3 className="text-sm font-semibold text-white mb-2">Target contenuti/mese</h3>
        {(data.pedClientSettings?.length ?? 0) > 0 ? (
          <>
            <ul className="space-y-1 text-sm text-white/90 mb-2">
              {data.pedClientSettings.map((s) => (
                <li key={s.id}>
                  <span className="font-medium">{s.owner?.name ?? abbreviateOwnerId(s.ownerId)}</span>
                  {' '}: {contentsPerWeekToContentsPerMonth(s.contentsPerWeek)} contenuti/mese
                </li>
              ))}
            </ul>
            <p className="text-sm text-accent/90">
              Totale target mese: {data.pedClientSettings.reduce((sum, s) => sum + contentsPerWeekToContentsPerMonth(s.contentsPerWeek), 0)} contenuti/mese
            </p>
          </>
        ) : (
          <p className="text-sm text-white/60">Target non impostato.</p>
        )}
      </div>
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <label className="text-white/70 text-sm flex items-center gap-2">
            Il tuo target contenuti/mese:
            <input
              type="number"
              min={0}
              max={99}
              value={contentsPerMonth}
              onChange={(e) => setContentsPerMonth(parseInt(e.target.value, 10) || 0)}
              onBlur={(e) => handleContentsPerMonthChange(parseInt(e.target.value, 10) || 0)}
              className="w-16 px-2 py-1 bg-dark border border-accent/20 rounded text-white text-sm"
            />
          </label>
          {savingContents && <span className="text-white/50 text-xs">Salvataggio…</span>}
          <span className="text-white/50 text-xs">Stesso valore della pagina PED generale.</span>
        </div>
      )}
      <p className="text-xs text-white/50 mb-2">
        Solo le task di questo cliente. Modifiche qui si riflettono anche nella pagina PED.
      </p>
      <div
        className="border border-accent/20 rounded-lg overflow-hidden bg-white/5 flex flex-col"
        style={{
          minWidth: 800,
          minHeight: 420,
          width: '100%',
          height: 520,
        }}
      >
        <div className="flex-1 min-h-0 flex flex-col">
          <PedCalendar
            year={year}
            month={month}
            items={itemsWithDateString}
            dailyStats={data.computedStats.dailyStats}
            currentUserId={currentUserId}
            onOpenAdd={canWrite ? handleOpenAdd : undefined}
            onOpenAddExtra={canWrite ? handleOpenAddExtra : undefined}
            onOpenEdit={handleOpenEdit}
            onToggleDone={handleToggleDone}
            onMoveItem={handleMoveItem}
            onDuplicateItem={handleDuplicateItem}
            onDeleteItem={handleDeleteItem}
            onReorderInDay={handleReorderInDay}
            onSelectDay={setSelectedDateKey}
            filterClientId={clientId}
            filterType=""
          />
        </div>
      </div>

      <PedItemModal
        open={modalOpen}
        onClose={handleCloseModal}
        dateKey={modalDateKey}
        editItem={modalEditItem}
        initialIsExtra={modalIsExtra}
        initialClientId={clientId}
        clients={clients}
        works={works}
        users={users}
        currentUserId={currentUserId}
        onSuccess={refetch}
      />
    </div>
  )
}
