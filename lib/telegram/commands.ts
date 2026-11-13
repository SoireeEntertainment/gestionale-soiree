import { formatDateItFromYmd, todayDateOnlyRome } from '@/lib/assistant-v2/dates'
import { addDaysToDateString } from '@/lib/ped-utils'

export type SlashCommand =
  | { type: 'help' }
  | { type: 'start'; token?: string }
  | { type: 'natural'; text: string }

/** Mappa comandi slash a testo naturale per il motore V2 (o help/start). */
export function parseTelegramCommand(raw: string): SlashCommand {
  const text = raw.trim()
  if (!text.startsWith('/')) return { type: 'natural', text }

  const [cmdRaw, ...rest] = text.split(/\s+/)
  const cmd = cmdRaw.split('@')[0].toLowerCase()
  const arg = rest.join(' ').trim()

  switch (cmd) {
    case '/start':
      return { type: 'start', token: arg || undefined }
    case '/aiuto':
    case '/help':
      return { type: 'help' }
    case '/oggi': {
      const today = todayDateOnlyRome()
      return {
        type: 'natural',
        text: `Cosa devo fare oggi (${formatDateItFromYmd(today)})? Mostra il mio PED personale di oggi e le mie task giornaliere aperte, separandole chiaramente.`,
      }
    }
    case '/domani': {
      const today = todayDateOnlyRome()
      const tomorrow = addDaysToDateString(today, 1)
      return {
        type: 'natural',
        text: `Mostrami il mio PED di domani (${formatDateItFromYmd(tomorrow)}) e le task giornaliere in scadenza domani, separandole.`,
      }
    }
    case '/settimana':
      return {
        type: 'natural',
        text: 'Mostrami il mio PED di questa settimana (lun–dom), contenuti aperti e fatti.',
      }
    case '/task':
      return {
        type: 'natural',
        text: 'Quali task giornaliere ho ancora aperte oggi? Elenca solo le DailyTask, non i contenuti PED.',
      }
    default:
      return { type: 'natural', text: arg ? `${cmd} ${arg}` : text }
  }
}
