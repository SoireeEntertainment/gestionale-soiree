import { prisma } from '@/lib/prisma'
import type { ListedContextItem } from '@/lib/telegram/types'
import type { ThreadMemoryRefs } from '@/lib/assistant-v2/types'

type TelegramThreadContext = {
  v2Memory?: ThreadMemoryRefs & {
    lastListedItems?: ListedContextItem[]
  }
  channel?: string
  [key: string]: unknown
}

const ORDINAL_MAP: Record<string, number> = {
  primo: 1,
  prima: 1,
  '1': 1,
  '1°': 1,
  secondo: 2,
  seconda: 2,
  '2': 2,
  '2°': 2,
  terzo: 3,
  terza: 3,
  '3': 3,
  '3°': 3,
  quarto: 4,
  quarta: 4,
  '4': 4,
  quinto: 5,
  quinta: 5,
  '5': 5,
  sesto: 6,
  '6': 6,
  settimo: 7,
  '7': 7,
  ottavo: 8,
  '8': 8,
  nono: 9,
  '9': 9,
  decimo: 10,
  '10': 10,
}

export async function getOrCreateTelegramThread(userId: string, chatId: string) {
  const externalKey = String(chatId)
  const existing = await prisma.chatThread.findFirst({
    where: { userId, source: 'telegram', externalKey },
  })
  if (existing) return existing

  try {
    return await prisma.chatThread.create({
      data: {
        userId,
        source: 'telegram',
        externalKey,
        title: 'Telegram',
        assistantContext: { channel: 'telegram' },
      },
    })
  } catch {
    const again = await prisma.chatThread.findFirst({
      where: { userId, source: 'telegram', externalKey },
    })
    if (!again) throw new Error('Impossibile creare thread Telegram')
    return again
  }
}

export async function loadLastListedItems(threadId: string): Promise<ListedContextItem[]> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: { assistantContext: true },
  })
  const ctx = (thread?.assistantContext ?? {}) as TelegramThreadContext
  return ctx.v2Memory?.lastListedItems ?? []
}

export async function saveLastListedItems(threadId: string, items: ListedContextItem[]): Promise<void> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: { assistantContext: true },
  })
  const prev = (thread?.assistantContext ?? {}) as TelegramThreadContext
  const next: TelegramThreadContext = {
    ...prev,
    channel: 'telegram',
    v2Memory: {
      ...(prev.v2Memory ?? {}),
      lastListedItems: items,
    },
  }
  await prisma.chatThread.update({
    where: { id: threadId },
    data: { assistantContext: next as object },
  })
}

/**
 * Espande riferimenti ordinali ("il secondo") con gli id dell'elenco precedente.
 * Non inventa: se manca il contesto, lascia il messaggio invariato.
 */
export function expandOrdinalReferences(
  message: string,
  listed: ListedContextItem[]
): { text: string; resolved?: ListedContextItem; ambiguous?: boolean } {
  if (!listed.length) return { text: message }

  const m = message.match(
    /\b(?:il|la|lo)\s+(primo|prima|secondo|seconda|terzo|terza|quarto|quarta|quinto|quinta|sesto|settimo|ottavo|nono|decimo|\d+°?)\b/i
  )
  if (!m) return { text: message }

  const idx = ORDINAL_MAP[m[1].toLowerCase()]
  if (!idx) return { text: message }
  const item = listed.find((x) => x.index === idx)
  if (!item) {
    return { text: message, ambiguous: true }
  }

  const enriched = `${message} [riferimento: ${item.kind} id=${item.id} «${item.label}»${
    item.clientName ? ` cliente ${item.clientName}` : ''
  }]`
  return { text: enriched, resolved: item }
}
