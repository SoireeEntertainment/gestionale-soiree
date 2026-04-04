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
  result?: { href?: string; success?: boolean; summary?: string }
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

  const send = async (opts?: { confirmPendingId?: string; message?: string }) => {
    const msg = opts?.message ?? input.trim()
    if (!opts?.confirmPendingId && !msg) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: activeId,
          message: opts?.confirmPendingId ? (msg || 'Conferma') : msg,
          confirmPendingId: opts?.confirmPendingId ?? null,
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
            Chiedi informazioni o proponi azioni (con conferma). Richiede <code className="text-accent/90">OPENAI_API_KEY</code> sul server.
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
                          {m.content}
                          {m.role === 'assistant' && m.pendingConfirmationId && (
                            <div className="mt-3 pt-2 border-t border-white/10">
                              <Button
                                size="sm"
                                disabled={loading}
                                onClick={() =>
                                  send({ confirmPendingId: m.pendingConfirmationId, message: 'Confermo' })
                                }
                              >
                                Conferma azione
                              </Button>
                            </div>
                          )}
                          {m.role === 'assistant' && m.result?.href && m.result.success && (
                            <div className="mt-2">
                              <Link
                                href={m.result.href}
                                className="text-accent text-sm underline hover:no-underline"
                              >
                                Apri risorsa
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
                    {loading ? 'Invio…' : 'Invia'}
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
