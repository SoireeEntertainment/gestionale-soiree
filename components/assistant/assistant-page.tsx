'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type ThreadRow = { id: string; title: string; createdAt: string; updatedAt: string }

type MsgRow = {
  id: string
  role: string
  content: string
  createdAt: string
  pendingConfirmationId?: string
  mode?: string
  assistantBadge?: string
  result?: { href?: string; success?: boolean; summary?: string }
}

function Badge({ kind }: { kind: string }) {
  const styles: Record<string, string> = {
    needs_confirmation: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
    action_done: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
    action_failed: 'bg-red-500/15 text-red-200 border-red-500/30',
    info: 'bg-white/10 text-white/70 border-white/15',
  }
  const labels: Record<string, string> = {
    needs_confirmation: 'Richiede conferma',
    action_done: 'Azione eseguita',
    action_failed: 'Azione non riuscita',
    info: 'Info',
  }
  const cls = styles[kind] ?? 'bg-white/10 text-white/60 border-white/10'
  return (
    <span className={`inline-block text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${cls}`}>
      {labels[kind] ?? kind}
    </span>
  )
}

export function AssistantPage() {
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MsgRow[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadThreads = useCallback(async () => {
    const res = await fetch('/api/assistant/threads')
    if (!res.ok) return
    const data = await res.json()
    setThreads(data.threads ?? [])
  }, [])

  const loadMessages = useCallback(async (id: string) => {
    setLoadingThread(true)
    setError(null)
    try {
      const res = await fetch(`/api/assistant/threads/${id}`)
      if (!res.ok) throw new Error('Caricamento messaggi fallito')
      const data = await res.json()
      setMessages(data.messages ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoadingThread(false)
    }
  }, [])

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (activeId) loadMessages(activeId)
  }, [activeId, loadMessages])

  const newThread = async () => {
    const res = await fetch('/api/assistant/threads', { method: 'POST' })
    if (!res.ok) return
    const data = await res.json()
    const t = data.thread as ThreadRow
    setThreads((prev) => [t, ...prev])
    setActiveId(t.id)
    setMessages([])
  }

  const send = async (opts?: {
    confirmPendingId?: string
    cancelPendingId?: string
    message?: string
  }) => {
    const msg = opts?.message ?? input.trim()
    if (!opts?.confirmPendingId && !opts?.cancelPendingId && !msg) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: activeId,
          message: opts?.confirmPendingId
            ? msg || 'Conferma'
            : opts?.cancelPendingId
              ? msg || 'Annulla'
              : msg,
          confirmPendingId: opts?.confirmPendingId ?? null,
          cancelPendingId: opts?.cancelPendingId ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Invio fallito')

      const tid = (data.threadId as string) || activeId
      if (data.threadId) setActiveId(data.threadId)
      setInput('')
      await loadThreads()
      if (tid) await loadMessages(tid)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark text-white p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto flex flex-col gap-4" style={{ height: 'calc(100vh - 8rem)' }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-white">Assistente</h1>
          <p className="text-white/50 text-sm max-w-xl">
            Comandi frequenti (credenziali, lavori, step, letture) funzionano anche senza LLM. Per il resto serve{' '}
            <code className="text-accent/90">OPENAI_API_KEY</code> sul server. Le modifiche richiedono conferma.
          </p>
        </div>

        <div className="flex flex-1 min-h-0 gap-4 border border-accent/20 rounded-xl overflow-hidden">
          <aside className="w-64 shrink-0 border-r border-white/10 flex flex-col bg-dark">
            <div className="p-3 border-b border-white/10">
              <Button size="sm" className="w-full" onClick={newThread}>
                + Nuova chat
              </Button>
            </div>
            <ul className="overflow-y-auto flex-1 p-2 space-y-1">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate ${
                      activeId === t.id ? 'bg-accent/20 text-accent' : 'text-white/80 hover:bg-white/5'
                    }`}
                  >
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="flex-1 flex flex-col min-w-0 bg-dark">
            {!activeId ? (
              <div className="flex-1 flex items-center justify-center text-white/50 p-8">
                Seleziona o crea una chat
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {loading && !loadingThread && (
                    <p className="text-accent/80 text-sm animate-pulse">L’assistente sta elaborando…</p>
                  )}
                  {loadingThread ? (
                    <p className="text-white/50">Caricamento…</p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap ${
                            m.role === 'user'
                              ? 'bg-accent/15 text-white border border-accent/30'
                              : 'bg-white/5 text-white/90 border border-white/10'
                          }`}
                        >
                          {m.role === 'assistant' && m.assistantBadge && (
                            <div className="mb-2">
                              <Badge kind={m.assistantBadge} />
                            </div>
                          )}
                          {m.content}
                          {m.role === 'assistant' && m.pendingConfirmationId && (
                            <div className="mt-3 pt-2 border-t border-amber-500/30 space-y-2">
                              <p className="text-amber-200/90 text-xs font-medium">Azione proposta — in attesa di conferma</p>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  disabled={loading}
                                  onClick={() =>
                                    send({ confirmPendingId: m.pendingConfirmationId, message: 'Confermo' })
                                  }
                                >
                                  Conferma
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="border-white/25 text-white hover:bg-white/10"
                                  disabled={loading}
                                  onClick={() =>
                                    send({ cancelPendingId: m.pendingConfirmationId, message: 'Annulla' })
                                  }
                                >
                                  Annulla
                                </Button>
                              </div>
                            </div>
                          )}
                          {m.role === 'assistant' && m.result?.href && m.result.success && (
                            <div className="mt-2">
                              <Link
                                href={m.result.href}
                                className="text-accent text-sm font-medium underline hover:no-underline"
                              >
                                {m.result.href.startsWith('/clients/')
                                  ? 'Apri scheda cliente'
                                  : m.result.href.startsWith('/works/')
                                    ? 'Apri lavoro'
                                    : 'Apri risorsa'}
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {error && (
                  <div className="px-4 py-2 text-red-400 text-sm border-t border-white/10">{error}</div>
                )}

                <form
                  className="p-3 border-t border-white/10 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    send()
                  }}
                >
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Scrivi un messaggio…"
                    className="flex-1 px-3 py-2 rounded-lg bg-dark border border-accent/20 text-white text-sm placeholder:text-white/40"
                    disabled={loading}
                  />
                  <Button type="submit" disabled={loading || !input.trim()}>
                    {loading ? 'Elaborazione…' : 'Invia'}
                  </Button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
