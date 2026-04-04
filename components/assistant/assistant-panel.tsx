'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const QUICK_PROMPTS: { label: string; text: string }[] = [
  { label: 'Aggiungi un nuovo cliente', text: 'Aggiungi un nuovo cliente' },
  { label: 'Clienti in scadenza', text: 'Mostrami i rinnovi in scadenza nei prossimi 30 giorni' },
  { label: 'Apri scheda cliente', text: 'Mostra l’elenco clienti' },
  { label: 'Crea un nuovo lavoro', text: 'Crea un nuovo lavoro' },
  { label: 'Assegna lavoro', text: 'Assegna un lavoro a un utente' },
  { label: 'Lavori in ritardo', text: 'Mostra lavori in ritardo' },
  { label: 'Aggiungi task PED', text: 'Aggiungi una task nel PED' },
  { label: 'Task di oggi', text: 'Mostra le mie task PED di oggi' },
  { label: 'Evento calendario', text: 'Crea un evento in calendario' },
  { label: 'Domini in scadenza', text: 'Mostra i domini in scadenza' },
]

function QuickPromptBar({
  onPick,
  disabled,
  compact,
}: {
  onPick: (text: string) => void
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-2', compact ? '' : 'gap-3')}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-white/35">Suggerimenti</p>
      <div className="flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p.text}
            type="button"
            disabled={disabled}
            onClick={() => onPick(p.text)}
            className={cn(
              'rounded-full border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-left text-[11px] font-medium leading-snug text-white/80',
              'transition-colors hover:border-accent/30 hover:bg-accent/[0.08] hover:text-accent',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-40',
              'sm:text-xs'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
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

const TEXTAREA_MIN = 52
const TEXTAREA_MAX = 140

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeId = isEmbedded ? storeThreadId : localActiveId
  const setActiveId = isEmbedded ? setStoreThread : setLocalActiveId
  const input = isEmbedded ? inputDraft : localInput
  const setInput = isEmbedded ? setInputDraft : setLocalInput

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const h = Math.min(Math.max(el.scrollHeight, TEXTAREA_MIN), TEXTAREA_MAX)
    el.style.height = `${h}px`
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [input, adjustTextareaHeight])

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
    setThreads((prev) => [t, ...prev.filter((x) => x.id !== t.id)])
    setActiveId(t.id)
    setMessages([])
  }

  const applyQuickPrompt = (text: string) => {
    setInput(text)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      adjustTextareaHeight()
    })
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

  const executeDelete = async () => {
    if (!confirmDeleteId) return
    const id = confirmDeleteId
    const wasActive = activeId === id
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/assistant/threads/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Eliminazione non riuscita')

      setThreads((prev) => prev.filter((t) => t.id !== id))
      setConfirmDeleteId(null)

      if (wasActive) {
        const cr = await fetch('/api/assistant/threads', { method: 'POST' })
        if (!cr.ok) throw new Error('Impossibile creare una nuova chat')
        const created = await cr.json()
        const t = created.thread as ThreadRow
        setThreads((prev) => [t, ...prev.filter((x) => x.id !== t.id)])
        setActiveId(t.id)
        setMessages([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setDeleting(false)
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
    'assistant-scrollbar flex w-[min(28%,8.75rem)] shrink-0 flex-col border-r border-white/[0.06] sm:w-[148px]',
    isEmbedded ? 'bg-white/[0.02]' : 'bg-white/[0.02]'
  )

  const mainClass = cn(
    'flex min-h-0 min-w-0 flex-1 flex-col',
    isEmbedded ? 'bg-[#0a0c10]' : 'bg-[#0a0c10]'
  )

  const showChatWelcome =
    Boolean(activeId) && messages.length === 0 && !loadingThread && !loading

  return (
    <div className={shellClass}>
      <Dialog open={Boolean(confirmDeleteId)} onOpenChange={(o) => !o && !deleting && setConfirmDeleteId(null)}>
        <DialogContent
          overlayClassName="z-[200]"
          className="z-[201] max-w-[min(calc(100vw-2rem),22rem)] border-white/[0.12] bg-[#12151c]"
          hideClose
        >
          <DialogHeader>
            <DialogTitle className="text-base">Elimina chat</DialogTitle>
            <DialogDescription className="text-white/60">
              Vuoi eliminare definitivamente questa chat?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              className="border-white/15 text-white/90 hover:bg-white/[0.08]"
              disabled={deleting}
              onClick={() => setConfirmDeleteId(null)}
            >
              Annulla
            </Button>
            <Button type="button" variant="danger" disabled={deleting} onClick={() => void executeDelete()}>
              {deleting ? 'Eliminazione…' : 'Elimina'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
            <div className="shrink-0 border-b border-white/[0.06] p-2.5">
              <button
                type="button"
                onClick={() => void newThread()}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04]',
                  'px-2 py-2 text-[11px] font-medium text-white/90 transition-colors sm:px-3 sm:text-xs',
                  'hover:border-accent/25 hover:bg-accent/[0.06] hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'
                )}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                Nuova chat
              </button>
            </div>
            <ul className="assistant-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {threads.map((t) => {
                const active = activeId === t.id
                return (
                  <li key={t.id} className="group">
                    <div className="flex items-stretch gap-0.5 rounded-xl transition-colors hover:bg-white/[0.04]">
                      <button
                        type="button"
                        onClick={() => setActiveId(t.id)}
                        className={cn(
                          'min-w-0 flex-1 truncate rounded-l-xl px-2.5 py-2 text-left text-[12px] leading-snug transition-colors sm:text-[13px]',
                          active
                            ? 'bg-accent/[0.14] font-medium text-accent ring-1 ring-accent/25 ring-inset'
                            : 'text-white/70 group-hover:text-white/90'
                        )}
                        title={t.title}
                      >
                        {t.title}
                      </button>
                      <button
                        type="button"
                        aria-label={`Elimina chat ${t.title}`}
                        disabled={deleting}
                        className={cn(
                          'shrink-0 rounded-r-xl px-1.5 text-white/30 opacity-0 transition-all group-hover:opacity-100',
                          'hover:bg-red-500/15 hover:text-red-300 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40',
                          deleting && 'pointer-events-none opacity-40'
                        )}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setConfirmDeleteId(t.id)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </aside>

          <section className={mainClass}>
            {!activeId ? (
              <div className="assistant-scrollbar flex flex-1 flex-col overflow-y-auto px-4 py-6">
                <div className="mx-auto flex w-full max-w-md flex-col gap-4 text-center">
                  <h2 className="text-lg font-semibold tracking-tight text-white">Come posso aiutarti oggi?</h2>
                  <p className="text-sm leading-relaxed text-white/45">
                    Puoi gestire clienti, lavori, PED, calendario e scadenze.
                  </p>
                  <QuickPromptBar onPick={applyQuickPrompt} disabled={loading} />
                  <Button
                    type="button"
                    className="mx-auto mt-2 w-full max-w-xs"
                    onClick={() => void newThread()}
                  >
                    Inizia una nuova chat
                  </Button>
                  <p className="text-xs text-white/30">Oppure scegli una chat dalla colonna a sinistra.</p>
                </div>
              </div>
            ) : (
              <>
                {showChatWelcome ? (
                  <div className="shrink-0 space-y-3 border-b border-white/[0.06] bg-[#0c0e12] px-4 py-4">
                    <div>
                      <h2 className="text-[15px] font-semibold text-white">Come posso aiutarti oggi?</h2>
                      <p className="mt-1 text-xs leading-relaxed text-white/45">
                        Puoi gestire clienti, lavori, PED, calendario e scadenze.
                      </p>
                    </div>
                    <QuickPromptBar onPick={applyQuickPrompt} disabled={loading} compact />
                  </div>
                ) : null}

                <div className="assistant-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
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
                            'max-w-[min(100%,22rem)] whitespace-pre-wrap text-[13px] leading-relaxed sm:max-w-[min(100%,24rem)] sm:text-sm',
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
                  <div className="flex items-end gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-2 pl-3 ring-0 transition-shadow focus-within:border-accent/25 focus-within:ring-1 focus-within:ring-accent/20">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onComposerKeyDown}
                      placeholder="Scrivi un messaggio…"
                      rows={1}
                      disabled={loading}
                      className={cn(
                        'min-h-[52px] max-h-[140px] w-0 min-w-0 flex-1 resize-none rounded-lg border-0 bg-transparent py-3 pr-1 text-[15px] leading-relaxed text-white shadow-none',
                        'placeholder:text-white/35 focus:outline-none focus:ring-0 disabled:opacity-50'
                      )}
                    />
                    <Button
                      type="submit"
                      disabled={loading || !input.trim()}
                      size="sm"
                      className="mb-1 h-11 w-11 shrink-0 rounded-xl p-0"
                      aria-label="Invia messaggio"
                    >
                      {loading ? (
                        <span className="text-lg leading-none">…</span>
                      ) : (
                        <Send className="h-[18px] w-[18px]" aria-hidden />
                      )}
                    </Button>
                  </div>
                  <p className="mt-2 px-0.5 text-[10px] text-white/30">
                    Invio con Invio · Nuova riga con Maiusc+Invio
                  </p>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
