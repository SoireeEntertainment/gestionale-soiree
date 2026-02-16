'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { upsertClientCredential, deleteClientCredential } from '@/app/actions/client-credentials'

type Credential = {
  id: string
  clientId: string
  label: string
  username: string | null
  password: string | null
  notes: string | null
}

export function ClientCredentialsSection({
  clientId,
  credentials,
  canWrite,
}: {
  clientId: string
  credentials: Credential[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({})

  const startAdd = () => {
    setEditingId(null)
    setLabel('')
    setUsername('')
    setPassword('')
    setNotes('')
    setAdding(true)
  }

  const startEdit = (c: Credential) => {
    setAdding(false)
    setEditingId(c.id)
    setLabel(c.label)
    setUsername(c.username ?? '')
    setPassword(c.password ?? '')
    setNotes(c.notes ?? '')
  }

  const cancel = () => {
    setAdding(false)
    setEditingId(null)
  }

  const handleSave = async () => {
    if (!label.trim()) return
    try {
      if (editingId) {
        await upsertClientCredential(clientId, {
          id: editingId,
          label: label.trim(),
          username: username.trim() || null,
          password: password || null,
          notes: notes.trim() || null,
        })
      } else {
        await upsertClientCredential(clientId, {
          label: label.trim(),
          username: username.trim() || null,
          password: password || null,
          notes: notes.trim() || null,
        })
      }
      cancel()
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const handleDelete = async (credentialId: string) => {
    if (!confirm('Eliminare questa credenziale?')) return
    try {
      await deleteClientCredential(credentialId, clientId)
      if (editingId === credentialId) cancel()
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const toggleShowPassword = (id: string) => {
    setShowPassword((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="bg-dark border border-accent/20 rounded-lg p-6 mb-6">
      <h2 className="text-lg font-semibold text-white mb-4">Credenziali</h2>
      <p className="text-sm text-white/60 mb-4">
        Password e account per i vari servizi del cliente (social, email, sito, ecc.).
      </p>

      <ul className="space-y-3 mb-4">
        {credentials.map((c) => (
          <li
            key={c.id}
            className="border border-white/10 rounded-lg p-4 bg-white/5"
          >
            {editingId === c.id ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Etichetta (es. Instagram)"
                  className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white text-sm"
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username / email"
                  className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white text-sm"
                />
                <div className="flex gap-2">
                  <input
                    type={showPassword[c.id] ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="flex-1 px-3 py-2 bg-dark border border-accent/20 rounded text-white text-sm"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => toggleShowPassword(c.id)}>
                    {showPassword[c.id] ? 'Nascondi' : 'Mostra'}
                  </Button>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Note"
                  rows={2}
                  className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave}>Salva</Button>
                  <Button size="sm" variant="ghost" onClick={cancel}>Annulla</Button>
                  <Button size="sm" variant="danger" onClick={() => handleDelete(c.id)}>Elimina</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="font-medium text-accent">{c.label}</div>
                {c.username && (
                  <div className="text-sm text-white/80 mt-1">Utente: {c.username}</div>
                )}
                {c.password && (
                  <div className="text-sm text-white/60 mt-1">
                    Password: ••••••••
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => toggleShowPassword(c.id)}
                        className="ml-2 text-accent text-xs hover:underline"
                      >
                        {showPassword[c.id] ? 'Nascondi' : 'Mostra'}
                      </button>
                    )}
                    {showPassword[c.id] && <span className="ml-1 font-mono">{c.password}</span>}
                  </div>
                )}
                {c.notes && <div className="text-sm text-white/50 mt-1">{c.notes}</div>}
                {canWrite && (
                  <div className="mt-2">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(c)}>Modifica</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)} className="text-red-400">Elimina</Button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {adding && (
        <div className="border border-accent/20 rounded-lg p-4 bg-white/5 mb-4 space-y-3">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Etichetta (es. Instagram, Email, Sito)"
            className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white text-sm"
          />
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username / email"
            className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white text-sm"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note opzionali"
            rows={2}
            className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>Salva</Button>
            <Button size="sm" variant="ghost" onClick={cancel}>Annulla</Button>
          </div>
        </div>
      )}

      {canWrite && !adding && (
        <Button variant="secondary" size="sm" onClick={startAdd}>
          + Aggiungi credenziale
        </Button>
      )}
    </div>
  )
}
