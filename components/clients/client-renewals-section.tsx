'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getClientRenewals,
  createClientRenewal,
  updateClientRenewal,
  deleteClientRenewal,
  type ClientRenewalRow,
} from '@/app/actions/client-renewals'
import { RENEWAL_STATUSES } from '@/lib/validations'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const RENEWAL_STATUS_LABELS: Record<string, string> = {
  DA_FARE: 'Da fare',
  IN_CORSO: 'In corso',
  COMPLETATO: 'Completato',
  ANNULLATO: 'Annullato',
}
const RENEWAL_STATUS_CLASS: Record<string, string> = {
  DA_FARE: 'bg-white/20 text-white/90',
  IN_CORSO: 'bg-amber-500/30 text-amber-200',
  COMPLETATO: 'bg-green-500/30 text-green-200',
  ANNULLATO: 'bg-white/10 text-white/50',
}

const DATE_FMT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function toInputDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function renewalStatus(renewalDate: Date): 'scaduto' | 'in_scadenza' | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const rd = new Date(renewalDate)
  rd.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((rd.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays < 0) return 'scaduto'
  if (diffDays <= 7) return 'in_scadenza'
  return null
}

export function ClientRenewalsSection({
  clientId,
  initialRenewals,
  canWrite,
}: {
  clientId: string
  initialRenewals: ClientRenewalRow[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [renewals, setRenewals] = useState<ClientRenewalRow[]>(initialRenewals)
  const [openModal, setOpenModal] = useState(false)
  const [editing, setEditing] = useState<ClientRenewalRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    serviceName: '',
    renewalDate: '',
    billingDate: '',
    status: 'DA_FARE' as string,
    notes: '',
  })
  const [filter30Days, setFilter30Days] = useState(false)

  const refresh = async () => {
    const list = await getClientRenewals(clientId)
    setRenewals(list)
    router.refresh()
  }

  const openCreate = () => {
    setEditing(null)
    setForm({
      serviceName: '',
      renewalDate: toInputDate(new Date()),
      billingDate: '',
      status: 'DA_FARE',
      notes: '',
    })
    setOpenModal(true)
  }

  const openEdit = (r: ClientRenewalRow) => {
    setEditing(r)
    setForm({
      serviceName: r.serviceName,
      renewalDate: toInputDate(new Date(r.renewalDate)),
      billingDate: r.billingDate ? toInputDate(new Date(r.billingDate)) : '',
      status: (r as { status?: string }).status ?? 'DA_FARE',
      notes: r.notes ?? '',
    })
    setOpenModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (editing) {
        await updateClientRenewal(editing.id, clientId, {
          serviceName: form.serviceName,
          renewalDate: form.renewalDate,
          billingDate: form.billingDate.trim() || null,
          status: form.status,
          notes: form.notes.trim() || null,
        })
      } else {
        await createClientRenewal(clientId, {
          serviceName: form.serviceName,
          renewalDate: form.renewalDate,
          billingDate: form.billingDate.trim() || null,
          status: form.status,
          notes: form.notes.trim() || null,
        })
      }
      await refresh()
      setOpenModal(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Errore')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (r: ClientRenewalRow) => {
    if (!confirm('Eliminare questa scadenza?')) return
    try {
      await deleteClientRenewal(r.id, clientId)
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Errore')
    }
  }

  const in30Days = (d: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const limit = new Date(today)
    limit.setDate(limit.getDate() + 30)
    const rd = new Date(d)
    rd.setHours(0, 0, 0, 0)
    return rd >= today && rd <= limit
  }
  const filteredRenewals = filter30Days
    ? renewals.filter((r) => in30Days(new Date(r.renewalDate)))
    : renewals

  return (
    <div className="border border-accent/20 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-white">Scadenze e Rinnovi</h2>
        <div className="flex items-center gap-2">
          {renewals.length > 0 && (
            <button
              type="button"
              onClick={() => setFilter30Days((v) => !v)}
              className={`text-xs px-2 py-1 rounded border ${filter30Days ? 'bg-accent/20 border-accent/40 text-accent' : 'border-white/20 text-white/70 hover:text-white'}`}
            >
              In scadenza 30 gg
            </button>
          )}
          {canWrite && (
            <Button type="button" onClick={openCreate} variant="secondary" className="text-accent border-accent/30">
              Aggiungi rinnovo
            </Button>
          )}
        </div>
      </div>

      {filteredRenewals.length === 0 ? (
        <p className="text-white/60 text-sm">
          {filter30Days ? 'Nessuna scadenza nei prossimi 30 giorni.' : 'Nessuna scadenza. Aggiungi un rinnovo per tenere traccia delle scadenze.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/60 border-b border-white/10">
                <th className="pb-2 pr-4">Nome servizio</th>
                <th className="pb-2 pr-4">Data rinnovo</th>
                <th className="pb-2 pr-4">Data fatturazione</th>
                <th className="pb-2 pr-4">Stato</th>
                {canWrite && <th className="pb-2">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRenewals.map((r) => {
                const dateStatus = renewalStatus(r.renewalDate)
                const rowStatus = (r as { status?: string }).status ?? 'DA_FARE'
                return (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="py-2 pr-4 text-white">{r.serviceName}</td>
                    <td className="py-2 pr-4 text-white">{DATE_FMT.format(new Date(r.renewalDate))}</td>
                    <td className="py-2 pr-4 text-white">
                      {r.billingDate ? DATE_FMT.format(new Date(r.billingDate)) : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded ${RENEWAL_STATUS_CLASS[rowStatus] ?? RENEWAL_STATUS_CLASS.DA_FARE}`}>
                        {RENEWAL_STATUS_LABELS[rowStatus] ?? rowStatus}
                      </span>
                      {dateStatus === 'scaduto' && (
                        <span className="ml-1 text-xs px-2 py-0.5 rounded bg-red-500/30 text-red-300">Scaduto</span>
                      )}
                      {dateStatus === 'in_scadenza' && rowStatus !== 'COMPLETATO' && (
                        <span className="ml-1 text-xs px-2 py-0.5 rounded bg-amber-500/30 text-amber-200">In scadenza</span>
                      )}
                    </td>
                    {canWrite && (
                      <td className="py-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="text-accent hover:underline text-xs"
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          className="text-red-400 hover:underline text-xs"
                        >
                          Elimina
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifica scadenza' : 'Aggiungi scadenza rinnovo'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-1">Nome servizio *</label>
              <input
                type="text"
                required
                value={form.serviceName}
                onChange={(e) => setForm({ ...form, serviceName: e.target.value })}
                placeholder="es. Meta Ads, Hosting, Canone social"
                className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1">Data rinnovo *</label>
              <input
                type="date"
                required
                value={form.renewalDate}
                onChange={(e) => setForm({ ...form, renewalDate: e.target.value })}
                className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1">Data fatturazione</label>
              <input
                type="date"
                value={form.billingDate}
                onChange={(e) => setForm({ ...form, billingDate: e.target.value })}
                className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1">Stato</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white"
              >
                {RENEWAL_STATUSES.map((s) => (
                  <option key={s} value={s}>{RENEWAL_STATUS_LABELS[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1">Note</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpenModal(false)} disabled={loading}>
                Annulla
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Salvataggio...' : editing ? 'Salva' : 'Aggiungi'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
