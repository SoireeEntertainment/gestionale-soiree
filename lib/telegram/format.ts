import type { AssistantV2Card, AssistantV2Response } from '@/lib/assistant-v2/types'
import { appBaseUrl } from '@/lib/telegram/config'
import { opaqueCallbackToken } from '@/lib/telegram/security'
import type { ListedContextItem, TelegramReplyMarkup } from '@/lib/telegram/types'

function escapePlain(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function formatAssistantForTelegram(res: AssistantV2Response): {
  text: string
  replyMarkup?: TelegramReplyMarkup
  listedItems: ListedContextItem[]
} {
  const parts: string[] = []
  const listedItems: ListedContextItem[] = []
  let replyMarkup: TelegramReplyMarkup | undefined

  parts.push(escapePlain(res.reply))

  for (const card of res.cards ?? []) {
    if (card.type === 'confirmation') {
      parts.push('')
      parts.push(`⚠️ ${card.preview.title}`)
      parts.push(card.preview.summary)
      for (const f of card.preview.fields ?? []) {
        parts.push(`• ${f.label}: ${f.value}`)
      }
      replyMarkup = {
        inline_keyboard: [
          [
            { text: '✅ Conferma', callback_data: opaqueCallbackToken(card.pendingId, 'confirm') },
            { text: '✖️ Annulla', callback_data: opaqueCallbackToken(card.pendingId, 'cancel') },
          ],
        ],
      }
    } else if (card.type === 'list') {
      parts.push('')
      parts.push(card.title)
      card.items.forEach((item, i) => {
        const n = i + 1
        const line = `${n}. ${item.label}${item.meta ? ` — ${item.meta}` : ''}`
        parts.push(line)
        listedItems.push({
          index: n,
          kind: item.kind ?? guessKind(item.label, card.title),
          id: item.id || extractIdFromHref(item.href) || `idx-${n}`,
          label: item.label,
        })
      })
    } else if (card.type === 'result') {
      parts.push('')
      parts.push(`${card.success ? '✅' : '❌'} ${card.title}: ${card.summary}`)
      if (card.href) {
        parts.push(`🔗 ${absoluteHref(card.href)}`)
      }
    } else if (card.type === 'choices') {
      parts.push('')
      parts.push(card.prompt)
      card.choices.forEach((c, i) => parts.push(`${i + 1}. ${c.label}`))
    }
  }

  if (res.mode === 'needs_confirmation' && !replyMarkup && res.pendingConfirmationId) {
    replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '✅ Conferma',
            callback_data: opaqueCallbackToken(res.pendingConfirmationId, 'confirm'),
          },
          {
            text: '✖️ Annulla',
            callback_data: opaqueCallbackToken(res.pendingConfirmationId, 'cancel'),
          },
        ],
      ],
    }
  }

  const text = parts.join('\n').slice(0, 3900)
  return { text, replyMarkup, listedItems }
}

function absoluteHref(href: string): string {
  if (href.startsWith('http')) return href
  return `${appBaseUrl()}${href.startsWith('/') ? '' : '/'}${href}`
}

function extractIdFromHref(href?: string): string | null {
  if (!href) return null
  const m = href.match(/[?&]id=([^&]+)/) || href.match(/\/([a-z0-9_-]{10,})$/i)
  return m?.[1] ?? null
}

function guessKind(label: string, title: string): ListedContextItem['kind'] {
  const t = `${label} ${title}`.toLowerCase()
  if (t.includes('task') || t.includes('promemoria') || t.includes('sentire')) return 'task'
  if (t.includes('lavoro') || t.includes('work')) return 'work'
  return 'ped'
}

export function helpText(): string {
  return [
    'Soirëe Telegram Assistant',
    '',
    'Puoi scrivere in linguaggio naturale, anche con vocali.',
    '',
    'Comandi rapidi:',
    '/oggi — contenuti PED e task di oggi',
    '/domani — attività di domani',
    '/settimana — PED della settimana',
    '/task — task giornaliere aperte',
    '/aiuto — questo messaggio',
    '',
    `Gestionale: ${appBaseUrl()}`,
  ].join('\n')
}

export function buildQuickConfirmMarkup(pendingId: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Conferma', callback_data: opaqueCallbackToken(pendingId, 'confirm') },
        { text: '✖️ Annulla', callback_data: opaqueCallbackToken(pendingId, 'cancel') },
      ],
    ],
  }
}

/** Estrae item numerati dal testo tool per contesto "il secondo". */
export function listedItemsFromCards(cards?: AssistantV2Card[]): ListedContextItem[] {
  const out: ListedContextItem[] = []
  for (const card of cards ?? []) {
    if (card.type !== 'list') continue
    card.items.forEach((item, i) => {
      out.push({
        index: i + 1,
        kind: guessKind(item.label, card.title),
        id: extractIdFromHref(item.href) || `idx-${i + 1}`,
        label: item.label,
      })
    })
  }
  return out
}
