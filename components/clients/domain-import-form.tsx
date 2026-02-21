'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  analyzeDomainsInput,
  applyDomainRenewals,
  type DomainMatchResult,
  type MatchedRow,
} from '@/app/actions/domain-import'
import { Button } from '@/components/ui/button'

const DATE_FMT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function DomainImportForm() {
  const [text, setText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<DomainMatchResult | null>(null)
  const [summary, setSummary] = useState<{
    renewed: number
    clientsWithWebsite: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const clearImage = useCallback(() => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImageFile(null)
    setImagePreviewUrl(null)
  }, [imagePreviewUrl])

  const setImage = useCallback(
    (file: File | null) => {
      clearImage()
      if (!file) return
      if (!file.type.startsWith('image/')) return
      setImageFile(file)
      setImagePreviewUrl(URL.createObjectURL(file))
    },
    [clearImage]
  )

  const handleExtractFromImage = useCallback(async () => {
    if (!imageFile) return
    setError(null)
    setExtracting(true)
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('ita+eng', 0)
      const { data } = await worker.recognize(imageFile)
      await worker.terminate()
      const extracted = (data as { text?: string }).text ?? ''
      setText((prev) => (prev ? prev + '\n' + extracted : extracted))
      clearImage()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante l\'estrazione dal screenshot')
    } finally {
      setExtracting(false)
    }
  }, [imageFile, clearImage])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const item = e.clipboardData?.items?.[0]
    if (item?.kind === 'file' && item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (file) setImage(file)
    }
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setImage(file)
    e.target.value = ''
  }, [])

  const handleAnalyze = async () => {
    setError(null)
    setResult(null)
    setSummary(null)
    setLoading(true)
    try {
      const { matchResult } = await analyzeDomainsInput(text)
      setResult(matchResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante l\'analisi')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    if (!result || result.matched.length === 0) return
    setError(null)
    setApplying(true)
    try {
      const out = await applyDomainRenewals(result.matched)
      setSummary(out)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante l\'import')
    } finally {
      setApplying(false)
    }
  }

  const hasMatched = result && result.matched.length > 0
  const hasUnmatched = result && result.unmatched.length > 0
  const hasAmbiguous = result && result.ambiguous.length > 0

  return (
    <div className="space-y-6" onPaste={handlePaste}>
      <div className="flex items-center gap-4">
        <Link href="/clients" className="text-accent hover:underline">
          ← Torna ai clienti
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-white">Importa domini</h1>
      <p className="text-white/70 text-sm">
        Incolla l&apos;elenco domini e scadenze, oppure carica uno screenshot della lista (es. Hostinger). Formati testo: <code className="bg-white/10 px-1 rounded">dominio.tld | YYYY-MM-DD</code> oppure <code className="bg-white/10 px-1 rounded">dominio.tld,YYYY-MM-DD</code>.
      </p>

      {/* Import da screenshot */}
      <div
        className="rounded-lg border border-dashed border-accent/30 bg-white/5 p-4"
        onPaste={handlePaste}
      >
        <div className="text-sm font-medium text-white mb-2">Da screenshot</div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            className="border-accent/30 text-accent"
            onClick={() => fileInputRef.current?.click()}
          >
            Carica immagine
          </Button>
          <span className="text-white/50 text-sm">oppure incolla qui (Ctrl+V) con uno screenshot negli appunti</span>
        </div>
        {imageFile && (
          <div className="mt-3 flex flex-wrap items-start gap-3">
            {imagePreviewUrl && (
              <img
                src={imagePreviewUrl}
                alt="Screenshot"
                className="max-h-40 rounded border border-white/10 object-contain"
              />
            )}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                onClick={handleExtractFromImage}
                disabled={extracting}
              >
                {extracting ? 'Estrazione testo...' : 'Estrai testo dall\'immagine'}
              </Button>
              <Button type="button" variant="ghost" onClick={clearImage} className="text-white/70">
                Annulla
              </Button>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-1">Testo elenco (incolla o ricavato da screenshot)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="miosito.it | 2026-02-21&#10;mcdentalteam.it,2026-03-15"
          rows={8}
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white font-mono text-sm placeholder:text-white/40"
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={handleAnalyze} disabled={loading}>
          {loading ? 'Analisi...' : 'Analizza'}
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-sm">
          {error}
        </div>
      )}

      {summary && (
        <div className="p-4 rounded-lg bg-accent/20 border border-accent/40 text-white">
          <h3 className="font-semibold mb-2">Import completato</h3>
          <ul className="text-sm space-y-1">
            <li>Scadenze dominio create/aggiornate: <strong>{summary.renewed}</strong></li>
            <li>Clienti con categoria Website attivata: <strong>{summary.clientsWithWebsite}</strong></li>
          </ul>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-white">Anteprima</h2>

          {hasMatched && (
            <div>
              <h3 className="text-white/90 font-medium mb-2">
                Riconosciuti ({result.matched.length}) — verranno importati
              </h3>
              <div className="overflow-x-auto border border-accent/20 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-white/60 border-b border-white/10 bg-white/5">
                      <th className="px-4 py-2">Dominio</th>
                      <th className="px-4 py-2">Scadenza</th>
                      <th className="px-4 py-2">Cliente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matched.map((row: MatchedRow) => (
                      <tr key={row.domain} className="border-b border-white/5">
                        <td className="px-4 py-2 text-white">{row.domain}</td>
                        <td className="px-4 py-2 text-white">{DATE_FMT.format(new Date(row.expiryDate + 'T00:00:00'))}</td>
                        <td className="px-4 py-2 text-white">{row.clientName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2">
                <Button
                  type="button"
                  onClick={handleApply}
                  disabled={applying}
                >
                  {applying ? 'Import in corso...' : 'Applica import'}
                </Button>
              </div>
            </div>
          )}

          {hasAmbiguous && (
            <div>
              <h3 className="text-amber-200 font-medium mb-2">
                Ambigui — da confermare ({result.ambiguous.length})
              </h3>
              <p className="text-white/60 text-sm mb-2">Più clienti possibili: non vengono importati finché non scegli tu.</p>
              <div className="overflow-x-auto border border-amber-500/30 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-white/60 border-b border-white/10 bg-white/5">
                      <th className="px-4 py-2">Dominio</th>
                      <th className="px-4 py-2">Scadenza</th>
                      <th className="px-4 py-2">Clienti possibili</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.ambiguous.map((row) => (
                      <tr key={row.domain} className="border-b border-white/5">
                        <td className="px-4 py-2 text-white">{row.domain}</td>
                        <td className="px-4 py-2 text-white">{DATE_FMT.format(new Date(row.expiryDate + 'T00:00:00'))}</td>
                        <td className="px-4 py-2 text-white/80">
                          {row.possibleClients.map((c) => c.name).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasUnmatched && (
            <div>
              <h3 className="text-white/90 font-medium mb-2">
                Non riconosciuti / Da mappare ({result.unmatched.length})
              </h3>
              <p className="text-white/60 text-sm mb-2">Nessun cliente trovato: non vengono importati.</p>
              <div className="overflow-x-auto border border-accent/20 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-white/60 border-b border-white/10 bg-white/5">
                      <th className="px-4 py-2">Dominio</th>
                      <th className="px-4 py-2">Scadenza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.unmatched.map((row) => (
                      <tr key={row.domain} className="border-b border-white/5">
                        <td className="px-4 py-2 text-white">{row.domain}</td>
                        <td className="px-4 py-2 text-white">{DATE_FMT.format(new Date(row.expiryDate + 'T00:00:00'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!hasMatched && !hasAmbiguous && !hasUnmatched && (
            <p className="text-white/60">Nessuna riga valida (dominio + data YYYY-MM-DD).</p>
          )}
        </div>
      )}
    </div>
  )
}
