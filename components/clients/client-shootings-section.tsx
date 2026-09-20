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
} from '@/app/actions/client-shootings'
import type { ClientShootingRow, ShootingReelRow } from '@/lib/types/client-shootings'
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

type ConfirmState =
  | { kind: 'delete-shooting'; shooting: ClientShootingRow }
  | { kind: 'delete-reel'; reel: ShootingReelRow }
  | null

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
  const [confirmState, setConfirmState] = useState<ConfirmState>(null)
  const [confirming, setConfirming] = useState(false)

  const [addReelShootingId, setAddReelShootingId] = useState<string | null>(null)
  const [addReelTopic, setAddReelTopic] = useState('')
  const [addingReel, setAddingReel] = useState(false)

  const [renameReel, setRenameReel] = useState<ShootingReelRow | null>(null)
  const [renameTopic, setRenameTopic] = useState('')
  const [renaming, setRenaming] = useState(false)

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

  const handleConfirmAction = async () => {
    if (!confirmState) return
    setConfirming(true)
    try {
      if (confirmState.kind === 'delete-shooting') {
        await deleteClientShooting(confirmState.shooting.id)
        showToast('Shooting eliminato', 'success')
      } else {
        await deleteShootingReel(confirmState.reel.id)
        showToast('Argomento eliminato', 'success')
      }
      setConfirmState(null)
      await reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore', 'error')
    } finally {
      setConfirming(false)
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

  const handleAddReelSave = async () => {
    if (!addReelShootingId) return
    const trimmed = addReelTopic.trim()
    if (!trimmed) {
      showToast('Inserisci un argomento', 'error')
      return
    }
    setAddingReel(true)
    try {
      await createShootingReel(addReelShootingId, trimmed)
      showToast('Argomento aggiunto', 'success')
      setAddReelShootingId(null)
      setAddReelTopic('')
      await reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore', 'error')
    } finally {
      setAddingReel(false)
    }
  }

  const handleRenameSave = async () => {
    if (!renameReel) return
    const trimmed = renameTopic.trim()
    if (!trimmed) {
      showToast('Inserisci un argomento', 'error')
      return
    }
    if (trimmed === renameReel.topic) {
      setRenameReel(null)
      return
    }
    setRenaming(true)
    try {
      await updateShootingReel(renameReel.id, { topic: trimmed })
      showToast('Argomento aggiornato', 'success')
      setRenameReel(null)
      await reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore', 'error')
    } finally {
      setRenaming(false)
    }
  }

  const confirmTitle =
    confirmState?.kind === 'delete-shooting'
      ? 'Elimina shooting'
      : confirmState?.kind === 'delete-reel'
        ? 'Elimina argomento Reel'
        : ''

  const confirmDescription = (() => {
    if (!confirmState) return ''
    if (confirmState.kind === 'delete-shooting') {
      const linked = confirmState.shooting.reels.filter((r) => r.pedTaskId).length
      return linked > 0
        ? `Eliminare lo shooting "${confirmState.shooting.name}"? Verranno rimossi ${linked} collegament${linked === 1 ? 'o' : 'i'} con task PED (le task non verranno eliminate).`
        : `Eliminare lo shooting "${confirmState.shooting.name}" e tutti i suoi argomenti?`
    }
    if (confirmState.reel.pedTaskId) {
      return `L’argomento "${confirmState.reel.topic}" è collegato a una task PED. Eliminandolo il collegamento verrà rimosso (la task resta). Continuare?`
    }
    return `Eliminare l’argomento "${confirmState.reel.topic}"?`
  })()

  return (
    <div className="bg-dark border border-accent/20 rounded-lg p-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-white">Shooting e Reel</h2>
        {canWrite && (
          <Button size="sm" onClick={openCreate}>
            + Aggiungi shooting
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
                    {s.publishedReels}/{s.totalReels} Reel pubblicati
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
                      onClick={() => setConfirmState({ kind: 'delete-shooting', shooting: s })}
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
                                onClick={() => {
                                  setRenameReel(r)
                                  setRenameTopic(r.topic)
                                }}
                              >
                                Modifica
                              </button>
                              <button
                                type="button"
                                className="text-xs text-red-400 hover:text-red-300"
                                onClick={() => setConfirmState({ kind: 'delete-reel', reel: r })}
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
                  onClick={() => {
                    setAddReelShootingId(s.id)
                    setAddReelTopic('')
                  }}
                >
                  + Aggiungi argomento
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="shooting-form-desc">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Modifica shooting' : 'Aggiungi shooting'}</DialogTitle>
            <DialogDescription id="shooting-form-desc">
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

      <Dialog open={!!confirmState} onOpenChange={(o) => !o && setConfirmState(null)}>
        <DialogContent aria-describedby="shooting-confirm-desc">
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription id="shooting-confirm-desc">{confirmDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => setConfirmState(null)} disabled={confirming}>
              Annulla
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={confirming}
              onClick={() => void handleConfirmAction()}
            >
              {confirming ? 'Eliminazione…' : 'Elimina'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!addReelShootingId}
        onOpenChange={(o) => {
          if (!o) {
            setAddReelShootingId(null)
            setAddReelTopic('')
          }
        }}
      >
        <DialogContent aria-describedby="add-reel-desc">
          <DialogHeader>
            <DialogTitle>Nuovo argomento Reel</DialogTitle>
            <DialogDescription id="add-reel-desc">
              Aggiungi un argomento allo shooting selezionato.
            </DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={addReelTopic}
            onChange={(e) => setAddReelTopic(e.target.value)}
            className="w-full px-2 py-1.5 bg-dark border border-accent/20 rounded text-white"
            placeholder="Es. Cos'è FisioSport"
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setAddReelShootingId(null)} disabled={addingReel}>
              Annulla
            </Button>
            <Button onClick={() => void handleAddReelSave()} disabled={addingReel}>
              {addingReel ? 'Salvataggio…' : 'Aggiungi'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameReel}
        onOpenChange={(o) => {
          if (!o) setRenameReel(null)
        }}
      >
        <DialogContent aria-describedby="rename-reel-desc">
          <DialogHeader>
            <DialogTitle>Modifica argomento</DialogTitle>
            <DialogDescription id="rename-reel-desc">Aggiorna il nome dell’argomento Reel.</DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={renameTopic}
            onChange={(e) => setRenameTopic(e.target.value)}
            className="w-full px-2 py-1.5 bg-dark border border-accent/20 rounded text-white"
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setRenameReel(null)} disabled={renaming}>
              Annulla
            </Button>
            <Button onClick={() => void handleRenameSave()} disabled={renaming}>
              {renaming ? 'Salvataggio…' : 'Salva'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
