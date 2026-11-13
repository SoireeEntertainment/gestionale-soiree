'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  disconnectTelegram,
  startTelegramLink,
  updateTelegramDigestPrefs,
} from '@/app/actions/telegram'

type TelegramStatus = {
  linked: boolean
  telegramUsername: string | null
  linkedAt: string | null
  botConfigured: boolean
}

type DigestPrefs = {
  enabled: boolean
  hour: number
  minute: number
  days: number[]
}

const WEEKDAYS: { id: number; label: string }[] = [
  { id: 1, label: 'Lun' },
  { id: 2, label: 'Mar' },
  { id: 3, label: 'Mer' },
  { id: 4, label: 'Gio' },
  { id: 5, label: 'Ven' },
  { id: 6, label: 'Sab' },
  { id: 7, label: 'Dom' },
]

export function TelegramSettings({
  initialStatus,
  initialDigest,
}: {
  initialStatus: TelegramStatus
  initialDigest: DigestPrefs
}) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [digest, setDigest] = useState(initialDigest)
  const [busy, setBusy] = useState(false)
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onLink = async () => {
    setBusy(true)
    setError(null)
    try {
      const session = await startTelegramLink()
      setDeepLink(session.deepLinkUrl)
      setExpiresAt(session.expiresAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setBusy(false)
    }
  }

  const onUnlink = async () => {
    if (!confirm('Scollegare Telegram da questo account?')) return
    setBusy(true)
    setError(null)
    try {
      await disconnectTelegram()
      setStatus({ linked: false, telegramUsername: null, linkedAt: null, botConfigured: status.botConfigured })
      setDeepLink(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setBusy(false)
    }
  }

  const onSaveDigest = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateTelegramDigestPrefs({
        enabled: digest.enabled,
        hour: digest.hour,
        minute: digest.minute,
        days: digest.days,
      })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setBusy(false)
    }
  }

  const toggleDay = (id: number) => {
    setDigest((d) => ({
      ...d,
      days: d.days.includes(id) ? d.days.filter((x) => x !== id) : [...d.days, id].sort(),
    }))
  }

  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-6 mb-8">
      <h2 className="text-xl font-semibold text-white mb-2">Telegram</h2>
      <p className="text-white/60 text-sm mb-4">
        Collega Telegram per consultare e gestire il tuo PED personale e le task giornaliere con messaggi e vocali.
      </p>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {status.linked ? (
        <div className="space-y-3 mb-6">
          <p className="text-white text-sm">
            Collegato
            {status.telegramUsername ? ` (@${status.telegramUsername})` : ''}
            {status.linkedAt
              ? ` · ${new Date(status.linkedAt).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}`
              : ''}
          </p>
          <Button variant="secondary" onClick={onUnlink} disabled={busy}>
            Scollega Telegram
          </Button>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {!status.botConfigured && (
            <p className="text-amber-400/90 text-sm">
              Bot non ancora configurato sull’ambiente (token/username). Puoi comunque preparare il collegamento quando sarà attivo.
            </p>
          )}
          <Button onClick={onLink} disabled={busy || !status.botConfigured}>
            {busy ? 'Generazione…' : 'Collega Telegram'}
          </Button>
          {deepLink && (
            <div className="space-y-2">
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-dark hover:opacity-90"
              >
                Apri bot Telegram
              </a>
              <p className="text-white/50 text-xs">
                Link monouso
                {expiresAt
                  ? ` · scade ${new Date(expiresAt).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome' })}`
                  : ''}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-accent/10 pt-4 space-y-3">
        <h3 className="text-white font-medium text-sm">Riepilogo quotidiano Telegram</h3>
        <p className="text-white/50 text-xs">Fuso orario: Europe/Rome (ora legale inclusa).</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={digest.enabled}
            onChange={(e) => setDigest((d) => ({ ...d, enabled: e.target.checked }))}
            className="rounded border-accent/30"
            disabled={!status.linked}
          />
          <span className="text-white text-sm">Attivo (solo con account collegato)</span>
        </label>
        <div className="flex items-center gap-2">
          <label className="text-white/70 text-sm">Ora</label>
          <input
            type="number"
            min={0}
            max={23}
            value={digest.hour}
            onChange={(e) => setDigest((d) => ({ ...d, hour: Number(e.target.value) }))}
            className="w-16 px-2 py-1 bg-dark border border-accent/20 rounded-md text-white text-sm"
            disabled={!status.linked}
          />
          <span className="text-white/50">:</span>
          <input
            type="number"
            min={0}
            max={59}
            step={5}
            value={digest.minute}
            onChange={(e) => setDigest((d) => ({ ...d, minute: Number(e.target.value) }))}
            className="w-16 px-2 py-1 bg-dark border border-accent/20 rounded-md text-white text-sm"
            disabled={!status.linked}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <button
              key={d.id}
              type="button"
              disabled={!status.linked}
              onClick={() => toggleDay(d.id)}
              className={`px-2 py-1 rounded text-xs border ${
                digest.days.includes(d.id)
                  ? 'border-accent bg-accent/20 text-white'
                  : 'border-accent/20 text-white/50'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <Button onClick={onSaveDigest} disabled={busy || !status.linked} variant="secondary">
          Salva riepilogo
        </Button>
      </div>
    </div>
  )
}
