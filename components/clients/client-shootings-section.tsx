'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  createClientShooting,
  updateClientShooting,
  deleteClientShooting,
  createShootingReel,
  updateShootingReel,
  deleteShootingReel,
  setShootingReelPublished,
  getClientShootings,
  type ClientShootingRow,
} from '@/app/actions/client-shootings'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { showToast } from '@/lib/toast'

const DATE_FMT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function toInputDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatShootingDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return DATE_FMT.format(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

type FormState = {
  date: string
  name: string
  location: string
  notes: string
  topics: string[]
}

const emptyForm = (): FormState => ({
  date: toInputDate(new Date()),
  name: '',
  location: '',
  notes: '',
  topics: [''],
})

export function ClientShootingsSection({
  clientId,
  canWrite = false,
}: {
  clientId: string
  canWrite?: boolean
}) {
  const [shootings, setShootings] = useState<ClientShootingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    try {
      const rows = await getClientShootings(clientId)
      setShootings(rows)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore caricamento shooting', 'error')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void reload()
  }, [reload])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  const openEdit = (s: ClientShootingRow) => {
    setEditingId(s.id)
    setForm({
      date: toInputDate(s.date),
      name: s.name,
      location: s.location ?? '',
      notes: s.notes ?? '',
      topics: s.reels.length > 0 ? s.reels.map((r) => r.topic) : [''],
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const topics = form.topics.map((t) => t.trim()).filter(Boolean)
    if (!form.date.trim() || !form.name.trim()) {
      showToast('Data e nome shooting sono obbligatori', 'error')
      return
    }
    if (topics.length === 0) {
      showToast('Aggiungi almeno un argomento Reel', 'error')
      return
    }
    const lower = topics.map((t) => t.toLowerCase())
    if (new Set(lower).size !== lower.length) {
      showToast('Rimuovi gli argomenti duplicati', 'error')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        await updateClientShooting(editingId, {
          date: form.date,
          name: form.name,
          location: form.location || null,
          notes: form.notes || null,
          topics,
        })
        showToast('Shooting aggiornato', 'success')
      } else {
        await createClientShooting({
          clientId,
          date: form.date,
          name: form.name,
          location: form.location || null,
          notes: form.notes || null,
          topics,
        })
        showToast('Shooting creato', 'success')
      }
      setDialogOpen(false)
      await reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteShooting = async (s: ClientShootingRow) => {
    const linked = s.reels.filter((r) => r.pedTaskId).length
    const msg =
      linked > 0
        ? `Eliminare lo shooting "${s.name}"? Verranno rimossi ${linked} collegament${linked === 1 ? 'o' : 'i'} con task PED (le task non verranno eliminate).`
        : `Eliminare lo shooting "${s.name}" e tutti i suoi argomenti?`
    if (!confirm(msg)) return
    try {
      await deleteClientShooting(s.id)
      showToast('Shooting eliminato', 'success')
      await reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore', 'error')
    }
  }

  const handleTogglePublished = async (reelId: string, published: boolean) => {
    setShootings((prev) =>
      prev.map((s) => ({
        ...s,
        reels: s.reels.map((r) =>
          r.id === reelId
            ? { ...r, published, publishedAt: published ? r.publishedAt ?? new Date() : null }
            : r
        ),
        publishedReels: s.reels.filter((r) => (r.id === reelId ? published : r.published)).length,
      }))
    )
    try {
      await setShootingReelPublished(reelId, published)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore', 'error')
      await reload()
    }
  }

  const handleDeleteReel = async (reel: ClientShootingRow['reels'][0]) => {
    if (reel.pedTaskId) {
      if (
        !confirm(
          `L’argomento "${reel.topic}" è collegato a una task PED. Eliminandolo il collegamento verrà rimosso (la task resta). Continuare?`
        )
      ) {
        return
      }
    } else if (!confirm(`Eliminare l’argomento "${reel.topic}"?`)) {
      return
    }
    try {
      await deleteShootingReel(reel.id)
      showToast('Argomento eliminato', 'success')
      await reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore', 'error')
    }
  }

  const handleAddReelInline = async (shootingId: string) => {
    const topic = prompt('Nuovo argomento Reel')
    if (topic == null) return
    const trimmed = topic.trim()
    if (!trimmed) return
    try {
      await createShootingReel(shootingId, trimmed)
      showToast('Argomento aggiunto', 'success')
      await reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore', 'error')
    }
  }

  const handleRenameReel = async (reelId: string, current: string) => {
    const next = prompt('Modifica argomento', current)
    if (next == null) return
    const trimmed = next.trim()
    if (!trimmed || trimmed === current) return
    try {
      await updateShootingReel(reelId, { topic: trimmed })
      showToast('Argomento aggiornato', 'success')
      await reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore', 'error')
    }
  }

  return (
    <div className="bg-dark border border-accent/20 rounded-lg p-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-white">Shooting e Reel</h2>
        {canWrite && (
          <Button size="sm" onClick={openCreate}>
            Aggiungi shooting
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-white/50 text-sm">Caricamento…</p>
      ) : shootings.length === 0 ? (
        <p className="text-white/50 text-sm">Nessuno shooting registrato per questo cliente.</p>
      ) : (
        <div className="space-y-6">
          {shootings.map((s) => (
            <div key={s.id} className="border border-white/10 rounded-lg p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-white font-medium">
                    {formatShootingDate(s.date)} — {s.name}
                    {s.location ? (
                      <span className="text-white/50 font-normal"> — {s.location}</span>
                    ) : null}
                  </div>
                  <div className="text-sm text-white/60 mt-1">
                    {s.publishedReels}/{s.totalReels} pubblicati
                    <span className="ml-2 inline-block h-1.5 w-24 bg-white/10 rounded overflow-hidden align-middle">
                      <span
                        className="block h-full bg-accent rounded"
                        style={{
                          width: `${s.totalReels === 0 ? 0 : Math.round((s.publishedReels / s.totalReels) * 100)}%`,
                        }}
                      />
                    </span>
                  </div>
                  {s.notes ? <p className="text-white/50 text-sm mt-1">{s.notes}</p> : null}
                </div>
                {canWrite && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(s)}>
                      Modifica
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400"
                      onClick={() => void handleDeleteShooting(s)}
                    >
                      Elimina
                    </Button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-white/50 border-b border-white/10">
                      <th className="py-2 pr-3 font-medium">Argomento Reel</th>
                      <th className="py-2 pr-3 font-medium">Pubblicato</th>
                      <th className="py-2 pr-3 font-medium">Collegamento PED</th>
                      {canWrite && <th className="py-2 font-medium">Azioni</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {s.reels.map((r) => (
                      <tr key={r.id} className="border-b border-white/5">
                        <td className="py-2 pr-3 text-white">{r.topic}</td>
                        <td className="py-2 pr-3">
                          <input
                            type="checkbox"
                            checked={r.published}
                            disabled={!canWrite}
                            onChange={(e) => void handleTogglePublished(r.id, e.target.checked)}
                            className="rounded border-white/40"
                            aria-label={`Pubblicato: ${r.topic}`}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          {r.pedTaskId ? (
                            <Link
                              href={r.pedTaskDate ? `/ped?week=${r.pedTaskDate}` : '/ped'}
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent/30"
                            >
                              Collegato al PED
                            </Link>
                          ) : (
                            <span className="text-white/40 text-xs">—</span>
                          )}
                        </td>
                        {canWrite && (
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="text-xs text-white/60 hover:text-white"
                                onClick={() => void handleRenameReel(r.id, r.topic)}
                              >
                                Rinomina
                              </button>
                              <button
                                type="button"
                                className="text-xs text-red-400 hover:text-red-300"
                                onClick={() => void handleDeleteReel(r)}
                              >
                                Elimina
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canWrite && (
                <button
                  type="button"
                  className="mt-2 text-xs text-accent hover:underline"
                  onClick={() => void handleAddReelInline(s.id)}
                >
                  + Aggiungi argomento
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Modifica shooting' : 'Aggiungi shooting'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Modifica data, nome, luogo e argomenti Reel dello shooting.'
                : 'Inserisci data, nome e argomenti Reel per il nuovo shooting.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm text-white/70">
              Data shooting *
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="mt-1 w-full px-2 py-1.5 bg-dark border border-accent/20 rounded text-white"
              />
            </label>
            <label className="block text-sm text-white/70">
              Nome shooting *
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full px-2 py-1.5 bg-dark border border-accent/20 rounded text-white"
                placeholder="Shooting Reel FisioSport"
              />
            </label>
            <label className="block text-sm text-white/70">
              Luogo
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="mt-1 w-full px-2 py-1.5 bg-dark border border-accent/20 rounded text-white"
                placeholder="Torino"
              />
            </label>
            <label className="block text-sm text-white/70">
              Note
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="mt-1 w-full px-2 py-1.5 bg-dark border border-accent/20 rounded text-white min-h-[60px]"
              />
            </label>
            <div>
              <div className="text-sm text-white/70 mb-2">Argomenti Reel *</div>
              <div className="space-y-2">
                {form.topics.map((topic, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) =>
                        setForm((f) => {
                          const topics = [...f.topics]
                          topics[idx] = e.target.value
                          return { ...f, topics }
                        })
                      }
                      className="flex-1 px-2 py-1.5 bg-dark border border-accent/20 rounded text-white"
                      placeholder={`Argomento ${idx + 1}`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-400"
                      disabled={form.topics.length <= 1}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          topics: f.topics.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      −
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => setForm((f) => ({ ...f, topics: [...f.topics, ''] }))}
              >
                + Aggiungi argomento
              </Button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
                Annulla
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Salvataggio…' : 'Salva'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
