'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PedMonthNav } from './ped-month-nav'
import { PedClientSettings } from './ped-client-settings'
import { PedCalendar } from './ped-calendar'
import { PedStats } from './ped-stats'
import { PedItemModal } from './ped-item-modal'
import { togglePedItemDone, updatePedItem, duplicatePedItem, deletePedItem, reorderPedItemsInDay, setPedItemLabel, fillPedMonth, emptyPedMonth, createPedItem } from '@/app/actions/ped'
import { Button } from '@/components/ui/button'
import { PED_ITEM_TYPE_LABELS, getISOWeekStart, toDateString } from '@/lib/ped-utils'
import { getEffectiveLabel } from '@/lib/pedLabels'

function getISOWeekStartKey(dateKey: string): string {
  return toDateString(getISOWeekStart(new Date(dateKey + 'T00:00:00.000Z')))
}

type UndoEntry =
  | { type: 'move'; itemId: string; date: string; isExtra: boolean }
  | { type: 'reorder'; dateKey: string; isExtra: boolean; orderedItemIds: string[] }
  | { type: 'toggleDone'; itemId: string; previousStatus: string; previousLabel: string }
  | { type: 'delete'; item: { clientId: string; date: string; kind: string; type: string; title: string; description?: string | null; priority?: string; label?: string | null; status: string; workId?: string | null; isExtra?: boolean; assignedToUserId?: string | null } }

type Client = { id: string; name: string }
type Work = { id: string; title: string }
type PedClientSetting = { id: string; clientId: string; contentsPerWeek: number; client: { id: string; name: string } }
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
}
type ComputedStats = {
  dailyStats: Record<string, { total: number; done: number; remainingPct: number; remainingCount?: number }>
  weeklyStats: { weekStart: string; weekEnd: string; total: number; done: number }[]
  monthlyStats: { total: number; done: number }
}
type InitialData = {
  pedClientSettings: PedClientSetting[]
  pedItems: PedItem[]
  computedStats: ComputedStats
}

type User = { id: string; name: string }

function pedPageUrl(year: number, month: number, userId?: string | null): string {
  const params = new URLSearchParams({ year: String(year), month: String(month) })
  if (userId) params.set('userId', userId)
  return `/ped?${params.toString()}`
}

export function PedView({
  initialData,
  clients,
  works,
  users,
  currentUserId,
  currentUserName,
  viewAsUserId,
  viewAsUserName,
  isViewingOtherUser,
  year,
  month,
}: {
  initialData: InitialData
  clients: Client[]
  works: Work[]
  users: User[]
  currentUserId: string
  currentUserName: string
  viewAsUserId: string
  viewAsUserName: string
  isViewingOtherUser: boolean
  year: number
  month: number
}) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDateKey, setModalDateKey] = useState<string | null>(null)
  const [modalEditItem, setModalEditItem] = useState<PedItem | null>(null)
  const [modalIsExtra, setModalIsExtra] = useState(false)
  const [filterClientId, setFilterClientId] = useState('')
  const [filterType, setFilterType] = useState('')
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null)
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const userDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false)
      }
    }
    if (userDropdownOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [userDropdownOpen])

  const itemsWithDateString = useMemo(() => {
    return initialData.pedItems.map((item) => ({
      ...item,
      date: typeof item.date === 'string' ? item.date : (item.date as unknown as Date).toISOString?.()?.slice(0, 10) ?? '',
    }))
  }, [initialData.pedItems])

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
    if (item) setUndoEntry({ type: 'toggleDone', itemId: id, previousStatus: item.status, previousLabel: getEffectiveLabel(item) })
    const result = await togglePedItemDone(id)
    if (result.ok) {
      router.refresh()
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
      router.refresh()
    } catch (e) {
      setUndoEntry(null)
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const handleDuplicateItem = async (itemId: string, targetDate: string, targetIsExtra: boolean) => {
    try {
      await duplicatePedItem(itemId, targetDate, targetIsExtra)
      router.refresh()
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
          priority: item.priority ?? 'MEDIUM',
          label: getEffectiveLabel(item),
          status: item.status,
          workId: item.workId ?? null,
          isExtra: item.isExtra,
          assignedToUserId: item.assignedToUserId ?? null,
        },
      })
    }
    try {
      await deletePedItem(itemId)
      router.refresh()
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
      router.refresh()
    } catch (e) {
      setUndoEntry(null)
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setModalDateKey(null)
    setModalEditItem(null)
    setModalIsExtra(false)
  }

  const handleSetLabel = async (id: string, label: string) => {
    const result = await setPedItemLabel(id, label)
    if (result.ok) {
      router.refresh()
    } else {
      alert(result.error ?? 'Errore')
    }
  }

  const [filling, setFilling] = useState(false)
  const [emptying, setEmptying] = useState(false)
  const handleFillMonth = async () => {
    setFilling(true)
    try {
      await fillPedMonth(year, month)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    } finally {
      setFilling(false)
    }
  }
  const handleEmptyMonth = async () => {
    if (!confirm('Svuotare tutte le task del mese? Questa azione non si può annullare.')) return
    setEmptying(true)
    try {
      await emptyPedMonth(year, month)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    } finally {
      setEmptying(false)
    }
  }

  const [undoing, setUndoing] = useState(false)
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
          await updatePedItem(undoEntry.itemId, { status: undoEntry.previousStatus, label: undoEntry.previousLabel })
          break
        case 'delete':
          await createPedItem(undoEntry.item)
          break
      }
      setUndoEntry(null)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    } finally {
      setUndoing(false)
    }
  }

  const handleSelectUser = (userId: string) => {
    setUserDropdownOpen(false)
    const url = pedPageUrl(year, month, userId === currentUserId ? undefined : userId)
    router.push(url)
  }

  return (
    <div className="space-y-6">
      <PedMonthNav
          year={year}
          month={month}
          userName={viewAsUserName}
          viewAsUserId={isViewingOtherUser ? viewAsUserId : null}
        >
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <div className="relative" ref={userDropdownRef}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUserDropdownOpen((o) => !o)}
              className="border border-accent/40 text-white hover:bg-white/10"
            >
              Guarda PED di…
            </Button>
            {userDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] rounded-lg border border-accent/30 bg-dark shadow-xl py-1">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUser(u.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center justify-between ${
                      u.id === viewAsUserId ? 'bg-accent/20 text-accent' : 'text-white'
                    }`}
                  >
                    <span>{u.name}</span>
                    {u.id === currentUserId && (
                      <span className="text-xs text-white/70">(tu)</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!isViewingOtherUser && (
            <>
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
            </>
          )}
        </div>
      </PedMonthNav>

      <div className="space-y-4 w-full">
        {/* Filtri e calendario a larghezza piena */}
        <div className="flex flex-wrap gap-4 items-center">
          <label className="text-white/70 text-sm">
            Filtra cliente:
            <select
              value={filterClientId}
              onChange={(e) => setFilterClientId(e.target.value)}
              className="ml-2 px-2 py-1 bg-dark border border-accent/20 rounded text-white"
            >
              <option value="">Tutti</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="text-white/70 text-sm">
            Filtra tipologia:
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="ml-2 px-2 py-1 bg-dark border border-accent/20 rounded text-white"
            >
              <option value="">Tutte</option>
              {Object.entries(PED_ITEM_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="bg-dark border border-accent/20 rounded-xl p-4 overflow-hidden">
          <p className="text-xs text-white/50 mb-2">
            Ridimensiona il riquadro trascinando l’angolo in basso a destra. Usa i controlli sotto per larghezza colonne e altezza righe.
          </p>
          <div
            className="border border-accent/20 rounded-lg overflow-hidden bg-white/5 flex flex-col"
            style={{
              resize: 'both',
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
                dailyStats={initialData.computedStats.dailyStats}
                currentUserId={currentUserId}
                viewAsUserId={viewAsUserId}
                readOnly={isViewingOtherUser}
                onOpenAdd={handleOpenAdd}
                onOpenAddExtra={handleOpenAddExtra}
                onOpenEdit={handleOpenEdit}
                onToggleDone={handleToggleDone}
                onSetLabel={handleSetLabel}
                onMoveItem={handleMoveItem}
                onDuplicateItem={handleDuplicateItem}
                onDeleteItem={handleDeleteItem}
                onReorderInDay={handleReorderInDay}
                onSelectDay={setSelectedDateKey}
                filterClientId={filterClientId}
                filterType={filterType}
              />
            </div>
          </div>
        </div>

        {/* Statistiche */}
        <PedStats
          stats={initialData.computedStats}
          selectedDateKey={selectedDateKey}
          year={year}
          month={month}
        />

        {/* Clienti del PED */}
        <PedClientSettings
          settings={initialData.pedClientSettings}
          clients={clients}
          userName={viewAsUserName}
          readOnly={isViewingOtherUser}
        />
      </div>

      <PedItemModal
        open={modalOpen}
        onClose={handleCloseModal}
        dateKey={modalDateKey}
        editItem={modalEditItem}
        initialIsExtra={modalIsExtra}
        clients={clients}
        works={works}
        users={users}
        currentUserId={currentUserId}
      />
    </div>
  )
}
