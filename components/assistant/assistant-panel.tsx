'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAssistantUiStore } from '@/lib/stores/assistant-ui-store'
import { cn } from '@/lib/utils'

export type ThreadRow = { id: string; title: string; createdAt: string; updatedAt: string }

export type MsgRow = {
  id: string
  role: string
  content: string
  createdAt: string
  pendingConfirmationId?: string
  mode?: string
  assistantBadge?: string
  result?: { href?: string; success?: boolean; summary?: string }
  quickLinks?: { label: string; href: string }[]
}

function MessageBadge({ kind }: { kind: string }) {
  const styles: Record<string, string> = {
    needs_confirmation: 'bg-amber-500/12 text-amber-200/90 ring-1 ring-amber-500/20',
    action_done: 'bg-emerald-500/10 text-emerald-200/85 ring-1 ring-emerald-500/15',
    action_failed: 'bg-red-500/10 text-red-200/90 ring-1 ring-red-500/18',
    info: 'bg-white/[0.06] text-white/55 ring-1 ring-white/[0.08]',
  }
  const labels: Record<string, string> = {
    needs_confirmation: 'Conferma',
    action_done: 'Fatto',
    action_failed: 'Errore',
    info: 'Info',
  }
  const cls = styles[kind] ?? 'bg-white/[0.05] text-white/50 ring-1 ring-white/[0.06]'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide',
        cls
      )}
    >
      {labels[kind] ?? kind}
    </span>
  )
}

type AssistantPanelProps = {
  embedded?: boolean
  variant?: 'page' | 'embedded'
}

export function AssistantPanel({ embedded = false, variant }: AssistantPanelProps) {
  const isEmbedded = embedded || variant === 'embedded'

  const storeThreadId = useAssistantUiStore((s) => s.activeThreadId)
  const setStoreThread = useAssistantUiStore((s) => s.setActiveThread)
  const inputDraft = useAssistantUiStore((s) => s.inputDraft)
  const setInputDraft = useAssistantUiStore((s) => s.setInputDraft)

  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [localActiveId, setLocalActiveId] = useState<string | null>(null)
  const [localInput, setLocalInput] = useState('')
  const [messages, setMessages] = useState<MsgRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeId = isEmbedded ? storeThreadId : localActiveId
  const setActiveId = isEmbedded ? setStoreThread : setLocalActiveId
  const input = isEmbedded ? inputDraft : localInput
  const setInput = isEmbedded ? setInputDraft : setLocalInput

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
    else setMessages([])
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

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!loading && input.trim()) void send()
    }
  }

  const shellClass = isEmbedded
    ? 'flex min-h-0 flex-1 flex-col bg-transparent text-white'
    : 'flex min-h-screen flex-col bg-dark text-white'

  const innerClass = isEmbedded
    ? 'flex min-h-0 flex-1 flex-col'
    : 'mx-auto flex min-h-0 w-[90vw] max-w-5xl flex-1 flex-col gap-6 px-4 py-8'

  const innerStyle = isEmbedded ? undefined : ({ minHeight: 'calc(100vh - 6rem)' } as const)

  const gridClass = isEmbedded
    ? 'flex min-h-0 flex-1 gap-0 overflow-hidden'
    : 'flex min-h-0 flex-1 gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1116] shadow-[0_25px_80px_-12px_rgba(0,0,0,0.5)]'

  const sidebarClass = cn(
    'flex w-[min(42%,11.5rem)] shrink-0 flex-col border-r border-white/[0.06] sm:w-[200px]',
    isEmbedded ? 'bg-white/[0.02]' : 'bg-white/[0.02]'
  )

  const mainClass = cn(
    'flex min-h-0 min-w-0 flex-1 flex-col',
    isEmbedded ? 'bg-[#0a0c10]' : 'bg-[#0a0c10]'
  )

  return (
    <div className={shellClass}>
      <div className={innerClass} style={innerStyle}>
        {!isEmbedded && (
          <header className="shrink-0 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Assistente</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-white/45">
              Comandi frequenti (credenziali, lavori, step, letture) funzionano anche senza LLM. Per il resto serve{' '}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs text-accent/90">OPENAI_API_KEY</code>{' '}
              sul server. Le modifiche richiedono conferma.
            </p>
          </header>
        )}

        <div className={gridClass}>
          <aside className={sidebarClass}>
            <div className="shrink-0 border-b border-white/[0.06] p-3">
              <button
                type="button"
                onClick={() => void newThread()}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04]',
                  'px-3 py-2.5 text-xs font-medium text-white/90 transition-colors',
                  'hover:border-accent/25 hover:bg-accent/[0.06] hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'
                )}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                Nuova chat
              </button>
            </div>
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2.5">
              {threads.map((t) => {
                const active = activeId === t.id
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(t.id)}
                      className={cn(
                        'w-full truncate rounded-xl px-3 py-2.5 text-left text-[13px] leading-snug transition-colors',
                        active
                          ? 'bg-accent/[0.12] font-medium text-accent ring-1 ring-accent/20'
                          : 'text-white/65 hover:bg-white/[0.05] hover:text-white/90'
                      )}
                      title={t.title}
                    >
                      {t.title}
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          <section className={mainClass}>
            {!activeId ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <p className="text-sm font-medium text-white/55">Nessuna conversazione</p>
                <p className="max-w-[240px] text-xs leading-relaxed text-white/35">
                  Seleziona una chat dalla lista o creane una nuova per iniziare.
                </p>
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                  {loading && !loadingThread && (
                    <p className="text-xs font-medium text-accent/70 animate-pulse">Sto elaborando…</p>
                  )}
                  {loadingThread ? (
                    <p className="text-sm text-white/40">Caricamento messaggi…</p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[min(100%,20rem)] whitespace-pre-wrap text-[13px] leading-relaxed sm:max-w-[min(100%,22rem)] sm:text-sm',
                            m.role === 'user'
                              ? 'rounded-2xl rounded-br-md bg-accent/[0.18] px-3.5 py-2.5 text-white ring-1 ring-accent/15'
                              : 'rounded-2xl rounded-bl-md bg-white/[0.05] px-3.5 py-2.5 text-white/88 ring-1 ring-white/[0.07]'
                          )}
                        >
                          {m.role === 'assistant' && m.assistantBadge && (
                            <div className="mb-2">
                              <MessageBadge kind={m.assistantBadge} />
                            </div>
                          )}
                          {m.content}
                          {m.role === 'assistant' && m.pendingConfirmationId && (
                            <div className="mt-3 space-y-2.5 border-t border-amber-500/15 pt-3">
                              <p className="text-[11px] font-medium leading-snug text-amber-200/75 sm:text-xs">
                                Azione in attesa di conferma
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  disabled={loading}
                                  className="rounded-lg px-3"
                                  onClick={() =>
                                    send({ confirmPendingId: m.pendingConfirmationId, message: 'Confermo' })
                                  }
                                >
                                  Conferma
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="rounded-lg border-white/15 px-3 text-white/85 hover:bg-white/[0.08]"
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
                          {m.role === 'assistant' && m.quickLinks && m.quickLinks.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                              {m.quickLinks.map((ql) => (
                                <Link
                                  key={`${ql.href}-${ql.label}`}
                                  href={ql.href}
                                  className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-accent/90 transition-colors hover:border-accent/25 hover:bg-accent/[0.08] sm:text-xs"
                                >
                                  {ql.label}
                                </Link>
                              ))}
                            </div>
                          )}
                          {m.role === 'assistant' && m.result?.href && m.result.success && (
                            <div className="mt-3 border-t border-white/[0.06] pt-3">
                              <Link
                                href={m.result.href}
                                className="text-xs font-medium text-accent/90 underline-offset-2 hover:text-accent hover:underline sm:text-sm"
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
                  <div className="shrink-0 border-t border-red-500/15 bg-red-500/5 px-4 py-2.5 text-xs text-red-300/90">
                    {error}
                  </div>
                )}

                <form
                  className="shrink-0 border-t border-white/[0.06] bg-[#0e1116] p-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void send()
                  }}
                >
                  <div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-1.5 pl-3 ring-0 transition-shadow focus-within:border-accent/25 focus-within:ring-1 focus-within:ring-accent/20">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onComposerKeyDown}
                      placeholder="Scrivi un messaggio…"
                      rows={1}
                      disabled={loading}
                      className={cn(
                        'max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-sm text-white placeholder:text-white/35',
                        'focus:outline-none disabled:opacity-50'
                      )}
                    />
                    <Button
                      type="submit"
                      disabled={loading || !input.trim()}
                      size="sm"
                      className="mb-0.5 h-10 w-10 shrink-0 rounded-xl p-0"
                      aria-label="Invia messaggio"
                    >
                      {loading ? (
                        <span className="text-lg leading-none">…</span>
                      ) : (
                        <Send className="h-4 w-4" aria-hidden />
                      )}
                    </Button>
                  </div>
                  <p className="mt-2 px-0.5 text-[10px] text-white/30">Invio con Invio · Nuova riga con Maiusc+Invio</p>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
