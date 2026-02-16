'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { updatePreferences } from '@/app/actions/user-preferences'

type Prefs = {
  notifyDeadline24h: boolean
  notifyDeadline48h: boolean
  notifyInReview: boolean
  notifyWaitingClient: boolean
  timezone: string
}

type ProfileSettingsProps = {
  userId: string
  initial: Prefs
}

export function ProfileSettings({ userId, initial }: ProfileSettingsProps) {
  const router = useRouter()
  const [prefs, setPrefs] = useState(initial)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updatePreferences(userId, prefs)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-semibold text-white mb-4">Impostazioni</h2>

      <div className="space-y-4 max-w-md">
        <p className="text-white/60 text-sm">Notifiche (in-app):</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.notifyDeadline24h}
            onChange={(e) => setPrefs((p) => ({ ...p, notifyDeadline24h: e.target.checked }))}
            className="rounded border-accent/30"
          />
          <span className="text-white text-sm">Avviso scadenza 24h prima</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.notifyDeadline48h}
            onChange={(e) => setPrefs((p) => ({ ...p, notifyDeadline48h: e.target.checked }))}
            className="rounded border-accent/30"
          />
          <span className="text-white text-sm">Avviso scadenza 48h prima</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.notifyInReview}
            onChange={(e) => setPrefs((p) => ({ ...p, notifyInReview: e.target.checked }))}
            className="rounded border-accent/30"
          />
          <span className="text-white text-sm">Avviso quando un lavoro passa in revisione</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.notifyWaitingClient}
            onChange={(e) => setPrefs((p) => ({ ...p, notifyWaitingClient: e.target.checked }))}
            className="rounded border-accent/30"
          />
          <span className="text-white text-sm">Avviso quando un lavoro è in attesa cliente</span>
        </label>

        <div>
          <label className="block text-sm text-white/70 mb-1">Fuso orario</label>
          <select
            value={prefs.timezone}
            onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}
            className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm"
          >
            <option value="Europe/Rome">Europe/Rome</option>
            <option value="Europe/London">Europe/London</option>
            <option value="UTC">UTC</option>
          </select>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Salvataggio...' : 'Salva preferenze'}
        </Button>
      </div>
    </div>
  )
}
