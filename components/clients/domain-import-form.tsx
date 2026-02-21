'use client'

import { useState } from 'react'
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
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<DomainMatchResult | null>(null)
  const [summary, setSummary] = useState<{
    renewed: number
    clientsWithWebsite: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/clients" className="text-accent hover:underline">
          ← Torna ai clienti
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-white">Importa domini Hostinger</h1>
      <p className="text-white/70 text-sm">
        Incolla l&apos;elenco domini e scadenze. Formati supportati: <code className="bg-white/10 px-1 rounded">dominio.tld | YYYY-MM-DD</code> oppure <code className="bg-white/10 px-1 rounded">dominio.tld,YYYY-MM-DD</code> (una riga per dominio, o testo grezzo).
      </p>

      <div>
        <label className="block text-sm font-medium text-white mb-1">Incolla qui l&apos;elenco</label>
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
