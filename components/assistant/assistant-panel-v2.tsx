'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Send, Trash2 } from 'lucide-react'
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
import type { AssistantV2Card } from '@/lib/assistant-v2/types'

type ThreadRow = { id: string; title: string; createdAt: string; updatedAt: string }

type MsgRow = {
  id: string
  role: string
  content: string
  createdAt: string
  pendingConfirmationId?: string
  mode?: string
  assistantBadge?: string
  cards?: AssistantV2Card[]
  toolTrace?: { name: string; ok: boolean; summary?: string }[]
}

const QUICK_PROMPTS: { label: string; text: string }[] = [
  { label: 'Task di oggi', text: 'Quali task ho oggi?' },
  { label: 'Nuova task', text: 'Crea una nuova task' },
  { label: 'Clienti da sentire', text: 'Quali clienti devo sentire?' },
  { label: 'Lavori urgenti', text: 'Mostrami i lavori urgenti' },
  { label: 'Domini in scadenza', text: 'Quali domini scadono?' },
  { label: 'PED settimana', text: 'Mostrami il PED di questa settimana' },
]

const TEXTAREA_MIN = 52
const TEXTAREA_MAX = 140

function ConfirmationCard({
  card,
  disabled,
  onConfirm,
  onCancel,
}: {
  card: Extract<AssistantV2Card, { type: 'confirmation' }>
  disabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="mt-2 rounded-xl border border-accent/25 bg-accent/[0.06] p-3">
      <p className="text-xs font-semibold text-accent">{card.preview.title}</p>
      <p className="mt-1 text-sm text-white/85">{card.preview.summary}</p>
      {card.preview.fields?.length ? (
        <dl className="mt-2 space-y-1">
          {card.preview.fields.map((f) => (
            <div key={f.label} className="flex gap-2 text-[11px]">
              <dt className="shrink-0 text-white/40">{f.label}</dt>
              <dd className="text-white/75">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {card.preview.risk === 'destructive' ? (
        <p className="mt-2 text-[11px] text-red-300/90">Operazione distruttiva: verifica prima di confermare.</p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button type="button" size="sm" disabled={disabled} onClick={onConfirm} className="bg-accent text-dark hover:bg-accent/90">
          Conferma
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </div>
  )
}

export function AssistantPanelV2({ embedded = false }: { embedded?: boolean }) {
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
  const [toolStatus, setToolStatus] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const skipNextLoadRef = useRef<string | null>(null)
  const submittingRef = useRef(false)

  const activeId = embedded ? storeThreadId : localActiveId
  const setActiveId = embedded ? setStoreThread : setLocalActiveId
  const input = embedded ? inputDraft : localInput
  const setInput = embedded ? setInputDraft : setLocalInput

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, TEXTAREA_MIN), TEXTAREA_MAX)}px`
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
      const res = await fetch(`/api/assistant/threads/${id}?limit=40`)
      if (!res.ok) throw new Error('Caricamento messaggi fallito')
      const data = await res.json()
      setMessages(
        (data.messages ?? []).map(
          (m: {
            id: string
            role: string
            content: string
            createdAt: string
            pendingConfirmationId?: string
            mode?: string
            assistantBadge?: string
            cards?: AssistantV2Card[]
            toolTrace?: MsgRow['toolTrace']
          }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
            pendingConfirmationId: m.pendingConfirmationId,
            mode: m.mode,
            assistantBadge: m.assistantBadge,
            cards: m.cards,
            toolTrace: m.toolTrace,
          })
        )
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoadingThread(false)
    }
  }, [])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (!activeId) {
      setMessages([])
      return
    }
    if (skipNextLoadRef.current === activeId) {
      skipNextLoadRef.current = null
      return
    }
    void loadMessages(activeId)
  }, [activeId, loadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading, toolStatus])

  const newThread = async () => {
    const res = await fetch('/api/assistant/threads', { method: 'POST' })
    if (!res.ok) return
    const data = await res.json()
    const t = data.thread as ThreadRow
    setThreads((prev) => [t, ...prev.filter((x) => x.id !== t.id)])
    setActiveId(t.id)
    setMessages([])
  }

  const send = async (opts?: {
    confirmPendingId?: string
    cancelPendingId?: string
    message?: string
  }) => {
    const confirmId = opts?.confirmPendingId
    const cancelId = opts?.cancelPendingId
    const msg =
      confirmId || cancelId
        ? (opts?.message ?? input).trim() || (confirmId ? 'Conferma' : 'Annulla')
        : (opts?.message ?? input).trim()

    if (!confirmId && !cancelId && !msg) return
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    setToolStatus('Sto elaborando…')
    setError(null)
    if (!confirmId && !cancelId) setInput('')

    let tid = activeId

    try {
      if (!confirmId && !cancelId) {
        if (!tid) {
          const tr = await fetch('/api/assistant/threads', { method: 'POST' })
          if (!tr.ok) throw new Error('Impossibile creare la chat')
          const created = await tr.json()
          tid = (created.thread as ThreadRow).id
          skipNextLoadRef.current = tid
          setThreads((prev) => [created.thread, ...prev.filter((x) => x.id !== tid)])
          setActiveId(tid)
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `optimistic-user-${Date.now()}`,
            role: 'user',
            content: msg,
            createdAt: new Date().toISOString(),
          },
          {
            id: `optimistic-assistant-${Date.now()}`,
            role: 'assistant',
            content: 'Sto elaborando…',
            createdAt: new Date().toISOString(),
            assistantBadge: 'info',
          },
        ])
      }

      const res = await fetch('/api/assistant/v2/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: tid,
          message: msg,
          confirmPendingId: confirmId ?? null,
          cancelPendingId: cancelId ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Invio fallito')

      if (data.threadId) setActiveId(data.threadId)
      setInput('')

      const assistantMsg: MsgRow = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.reply ?? '',
        createdAt: new Date().toISOString(),
        mode: data.mode,
        pendingConfirmationId: data.pendingConfirmationId,
        assistantBadge:
          data.mode === 'needs_confirmation'
            ? 'needs_confirmation'
            : data.mode === 'action_result'
              ? 'action_done'
              : data.mode === 'clarification'
                ? 'info'
                : undefined,
        cards: data.cards,
        toolTrace: data.toolTrace,
      }

      setMessages((prev) => {
        const cleaned = prev.filter(
          (m) => !m.id.startsWith('optimistic-user-') && !m.id.startsWith('optimistic-assistant-')
        )
        if (confirmId || cancelId) {
          return [
            ...cleaned.map((m) =>
              m.pendingConfirmationId === confirmId || m.pendingConfirmationId === cancelId
                ? { ...m, pendingConfirmationId: undefined, cards: m.cards?.filter((c) => c.type !== 'confirmation') }
                : m
            ),
            {
              id: `user-${Date.now()}`,
              role: 'user',
              content: msg,
              createdAt: new Date().toISOString(),
            },
            assistantMsg,
          ]
        }
        return [
          ...cleaned,
          {
            id: `user-${Date.now()}`,
            role: 'user',
            content: msg,
            createdAt: new Date().toISOString(),
          },
          assistantMsg,
        ]
      })
      void loadThreads()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
      setMessages((prev) =>
        prev.filter(
          (m) => !m.id.startsWith('optimistic-user-') && !m.id.startsWith('optimistic-assistant-')
        )
      )
    } finally {
      setLoading(false)
      setToolStatus(null)
      submittingRef.current = false
    }
  }

  const deleteThread = async (id: string) => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/assistant/threads/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Eliminazione fallita')
      setThreads((prev) => prev.filter((t) => t.id !== id))
      if (activeId === id) {
        setActiveId(null)
        setMessages([])
      }
      setConfirmDeleteId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0e1116]">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => void newThread()} className="text-accent">
          <Plus className="mr-1 h-3.5 w-3.5" />
          Nuova
        </Button>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex gap-1">
            {threads.slice(0, 8).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                className={cn(
                  'max-w-[120px] truncate rounded-lg px-2 py-1 text-[11px]',
                  activeId === t.id ? 'bg-accent/15 text-accent' : 'text-white/50 hover:bg-white/[0.04]'
                )}
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
        {activeId ? (
          <button
            type="button"
            aria-label="Elimina conversazione"
            className="rounded-lg p-1.5 text-white/35 hover:bg-white/[0.05] hover:text-red-300"
            onClick={() => setConfirmDeleteId(activeId)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {!activeId && messages.length === 0 ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-white/55">
              Assistente Soirëe V2 — task, contatti, lavori, PED, clienti e rinnovi.
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p.text}
                  type="button"
                  disabled={loading}
                  onClick={() => void send({ message: p.text })}
                  className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/75 hover:border-accent/30 hover:text-accent"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {loadingThread ? (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Caricamento…
          </div>
        ) : null}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'bg-accent/90 text-dark'
                  : 'border border-white/[0.06] bg-white/[0.04] text-white/90'
              )}
            >
              {m.assistantBadge ? (
                <span className="mb-1 inline-block rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">
                  {m.assistantBadge === 'needs_confirmation'
                    ? 'Conferma'
                    : m.assistantBadge === 'action_done'
                      ? 'Fatto'
                      : 'Info'}
                </span>
              ) : null}
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.toolTrace?.length ? (
                <ul className="mt-2 space-y-0.5 text-[10px] text-white/40">
                  {m.toolTrace.map((t, i) => (
                    <li key={`${t.name}-${i}`}>
                      {t.ok ? '✓' : '✗'} {t.name}
                      {t.summary ? ` — ${t.summary}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
              {m.cards?.map((card, idx) => {
                if (card.type === 'confirmation' && m.pendingConfirmationId) {
                  return (
                    <ConfirmationCard
                      key={`${card.pendingId}-${idx}`}
                      card={card}
                      disabled={loading}
                      onConfirm={() => void send({ confirmPendingId: card.pendingId })}
                      onCancel={() => void send({ cancelPendingId: card.pendingId })}
                    />
                  )
                }
                if (card.type === 'list') {
                  return (
                    <div key={`list-${idx}`} className="mt-2 rounded-lg border border-white/[0.06] p-2">
                      <p className="text-[11px] font-medium text-white/55">{card.title}</p>
                      <ul className="mt-1 space-y-1">
                        {card.items.map((it, j) => (
                          <li key={j} className="text-xs text-white/80">
                            {it.href ? (
                              <Link href={it.href} className="text-accent hover:underline">
                                {it.label}
                              </Link>
                            ) : (
                              it.label
                            )}
                            {it.meta ? <span className="text-white/40"> · {it.meta}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                }
                if (card.type === 'result') {
                  return (
                    <div
                      key={`res-${idx}`}
                      className={cn(
                        'mt-2 rounded-lg border px-2.5 py-2 text-xs',
                        card.success
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100/90'
                          : 'border-red-500/20 bg-red-500/10 text-red-100/90'
                      )}
                    >
                      <p className="font-medium">{card.title}</p>
                      <p className="mt-0.5 opacity-90">{card.summary}</p>
                      {card.href ? (
                        <Link href={card.href} className="mt-1 inline-block text-accent hover:underline">
                          Apri
                        </Link>
                      ) : null}
                    </div>
                  )
                }
                if (card.type === 'choices') {
                  return (
                    <div key={`ch-${idx}`} className="mt-2 space-y-1">
                      <p className="text-[11px] text-white/50">{card.prompt}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {card.choices.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            disabled={loading}
                            onClick={() => void send({ message: c.label })}
                            className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/75 hover:border-accent/40 hover:text-accent"
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                }
                return null
              })}
            </div>
          </div>
        ))}
        {toolStatus ? (
          <div className="flex items-center gap-2 text-xs text-accent/80">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {toolStatus}
          </div>
        ) : null}
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-white/[0.06] bg-[#0e1116] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        {messages.length > 0 ? (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {QUICK_PROMPTS.slice(0, 4).map((p) => (
              <button
                key={p.text}
                type="button"
                disabled={loading}
                onClick={() => void send({ message: p.text })}
                className="shrink-0 rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-white/55 hover:text-accent"
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            rows={1}
            placeholder="Scrivi un messaggio…"
            disabled={loading}
            className="max-h-[140px] min-h-[52px] flex-1 resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-3 text-sm text-white placeholder:text-white/30 focus:border-accent/40 focus:outline-none"
          />
          <Button
            type="button"
            size="default"
            disabled={loading || !input.trim()}
            onClick={() => void send()}
            className="h-[52px] w-[52px] shrink-0 rounded-xl bg-accent p-0 text-dark hover:bg-accent/90"
            aria-label="Invia"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <Dialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <DialogContent className="border-white/10 bg-[#12161c] text-white">
          <DialogHeader>
            <DialogTitle>Eliminare la conversazione?</DialogTitle>
            <DialogDescription className="text-white/50">
              I messaggi verranno rimossi. Le azioni già eseguite restano nel gestionale.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
              Annulla
            </Button>
            <Button
              disabled={deleting || !confirmDeleteId}
              onClick={() => confirmDeleteId && void deleteThread(confirmDeleteId)}
              className="bg-red-500 text-white hover:bg-red-500/90"
            >
              Elimina
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
