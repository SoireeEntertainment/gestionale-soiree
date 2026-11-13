import { prisma } from '@/lib/prisma'
import {
  cancelAssistantV2Action,
  confirmAssistantV2Action,
  isAssistantV2Enabled,
  runAssistantV2Turn,
} from '@/lib/assistant-v2'
import { ASSISTANT_V2_LIMITS } from '@/lib/assistant-v2/config'
import { runWithRequestActorAsync } from '@/lib/request-actor'
import {
  answerCallbackQuery,
  sendTelegramMessage,
  telegramLog,
} from '@/lib/telegram/bot-api'
import { parseTelegramCommand } from '@/lib/telegram/commands'
import {
  expandOrdinalReferences,
  getOrCreateTelegramThread,
  loadLastListedItems,
  saveLastListedItems,
} from '@/lib/telegram/context'
import { TELEGRAM_ENV, TELEGRAM_LIMITS, isTelegramAssistantEnabled } from '@/lib/telegram/config'
import { formatAssistantForTelegram, helpText } from '@/lib/telegram/format'
import {
  consumeTelegramLinkToken,
  profileTelegramUrl,
  resolveUserFromTelegram,
} from '@/lib/telegram/linking'
import { checkTelegramRateLimit } from '@/lib/telegram/rate-limit'
import { parseCallbackToken } from '@/lib/telegram/security'
import { transcribeTelegramVoice } from '@/lib/telegram/voice'
import type { TelegramUpdate } from '@/lib/telegram/types'

async function persistTurn(input: {
  threadId: string
  userMessage: string
  reply: string
  metadata?: object
}) {
  await prisma.chatMessage.create({
    data: {
      threadId: input.threadId,
      role: 'user',
      content: input.userMessage.slice(0, ASSISTANT_V2_LIMITS.maxMessageChars),
    },
  })
  await prisma.chatMessage.create({
    data: {
      threadId: input.threadId,
      role: 'assistant',
      content: input.reply.slice(0, 8000),
      metadata: input.metadata ?? undefined,
    },
  })
}

export async function processTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (!isTelegramAssistantEnabled()) {
    telegramLog('disabled_skip')
    return
  }

  // Solo chat private: ignora gruppi/canali
  const message = update.message || update.edited_message
  const callback = update.callback_query

  if (update.channel_post) return

  if (callback) {
    await handleCallback(update)
    return
  }

  if (!message?.from || !message.chat) return
  if (message.chat.type !== 'private') return
  if (message.from.is_bot) return

  const telegramUserId = String(message.from.id)
  const chatId = String(message.chat.id)

  const rate = checkTelegramRateLimit(`tg:${telegramUserId}`)
  if (!rate.ok) {
    await sendTelegramMessage({
      chatId,
      text: `Troppe richieste. Riprova tra ${rate.retryAfterSec}s.`,
    })
    return
  }

  // Linking via /start <token>
  const textRaw = message.text?.trim() || ''
  if (textRaw.startsWith('/start')) {
    const parsed = parseTelegramCommand(textRaw)
    if (parsed.type === 'start' && parsed.token) {
      const linked = await consumeTelegramLinkToken({
        rawToken: parsed.token,
        telegramUserId,
        telegramChatId: chatId,
        telegramUsername: message.from.username || null,
      })
      if (linked.ok) {
        await sendTelegramMessage({
          chatId,
          text: `✅ Account collegato, ${linked.userName}.\nOra puoi chiedere: «Cosa devo fare oggi?»\n${profileTelegramUrl()}`,
        })
      } else {
        await sendTelegramMessage({ chatId, text: `❌ ${linked.error}` })
      }
      return
    }
    if (parsed.type === 'start') {
      const resolved = await resolveUserFromTelegram(telegramUserId)
      if (resolved) {
        await sendTelegramMessage({
          chatId,
          text: `Ciao ${resolved.user.name}! ${helpText()}`,
        })
      } else {
        await sendTelegramMessage({
          chatId,
          text: `Ciao! Per usare Soirëe Telegram Assistant collega l’account dal gestionale:\n${profileTelegramUrl()}\n\nProfilo → Collega Telegram`,
        })
      }
      return
    }
  }

  const resolved = await resolveUserFromTelegram(telegramUserId)
  if (!resolved) {
    await sendTelegramMessage({
      chatId,
      text: `Account non collegato o disattivato.\nCollega Telegram dal Profilo: ${profileTelegramUrl()}`,
    })
    return
  }

  // ChatId drift: aggiorna se l'utente ha riaperto la chat
  if (resolved.chatId !== chatId) {
    await prisma.telegramConnection.update({
      where: { id: resolved.connectionId },
      data: { telegramChatId: chatId },
    })
  }

  if (textRaw.startsWith('/aiuto') || textRaw.startsWith('/help')) {
    await sendTelegramMessage({ chatId, text: helpText() })
    return
  }

  let userText = ''
  if (message.voice) {
    const tr = await transcribeTelegramVoice(message.voice)
    if (!tr.ok) {
      await sendTelegramMessage({ chatId, text: `🎤 ${tr.error}` })
      return
    }
    userText = tr.text
    await sendTelegramMessage({
      chatId,
      text: `🎤 Ho capito: «${userText.slice(0, 400)}${userText.length > 400 ? '…' : ''}»`,
    })
  } else if (textRaw) {
    const parsed = parseTelegramCommand(textRaw)
    if (parsed.type === 'help') {
      await sendTelegramMessage({ chatId, text: helpText() })
      return
    }
    userText = parsed.type === 'natural' ? parsed.text : textRaw
  } else {
    await sendTelegramMessage({
      chatId,
      text: 'Invia un messaggio di testo o un vocale.',
    })
    return
  }

  if (!isAssistantV2Enabled()) {
    await sendTelegramMessage({
      chatId,
      text: 'Assistente AI non attivo su questo ambiente (ASSISTANT_V2_ENABLED).',
    })
    return
  }

  if (!TELEGRAM_ENV.writesEnabled()) {
    // Hint nel messaggio: il modello vede il testo; i tool write falliscono comunque se gated
    userText = `${userText}\n\n[Nota sistema: scritture Telegram disabilitate — solo consultazione. Se chiedono modifiche, spiega che le scritture non sono ancora attive.]`
  }

  const thread = await getOrCreateTelegramThread(resolved.user.id, chatId)
  const listed = await loadLastListedItems(thread.id)
  const expanded = expandOrdinalReferences(userText, listed)
  if (expanded.ambiguous) {
    await sendTelegramMessage({
      chatId,
      text: 'Non trovo quell’elemento nell’elenco precedente. Specifica titolo o cliente.',
    })
    return
  }
  const finalText = expanded.text.slice(0, TELEGRAM_LIMITS.maxMessageChars)

  const response = await runWithRequestActorAsync(resolved.user, async () =>
    runAssistantV2Turn({
      user: resolved.user,
      threadId: thread.id,
      userMessage: finalText,
    })
  )

  // Gate writes: se conferma richiesta ma writes off, non mostrare Conferma
  if (!TELEGRAM_ENV.writesEnabled() && response.mode === 'needs_confirmation') {
    await sendTelegramMessage({
      chatId,
      text: 'Le operazioni di scrittura via Telegram non sono ancora attive. Puoi consultare PED e task; per modificare usa il gestionale.',
    })
    await persistTurn({
      threadId: thread.id,
      userMessage: finalText,
      reply: 'Scritture Telegram disabilitate.',
    })
    return
  }

  const formatted = formatAssistantForTelegram(response)
  if (formatted.listedItems.length) {
    await saveLastListedItems(thread.id, formatted.listedItems)
  }

  const send = await sendTelegramMessage({
    chatId,
    text: formatted.text,
    replyMarkup: formatted.replyMarkup,
  })
  if (!send.ok) {
    telegramLog('send_failed', { description: send.description })
  }

  await persistTurn({
    threadId: thread.id,
    userMessage: finalText,
    reply: formatted.text,
    metadata: {
      mode: response.mode,
      pendingId: response.pendingConfirmationId,
      cards: response.cards,
    },
  })
}

async function handleCallback(update: TelegramUpdate): Promise<void> {
  const cb = update.callback_query
  if (!cb?.from || !cb.data) return
  const chat = cb.message?.chat
  if (!chat || chat.type !== 'private') {
    await answerCallbackQuery({ callbackQueryId: cb.id, text: 'Solo chat private.' })
    return
  }

  const telegramUserId = String(cb.from.id)
  const chatId = String(chat.id)
  const parsed = parseCallbackToken(cb.data)
  if (!parsed) {
    await answerCallbackQuery({ callbackQueryId: cb.id, text: 'Azione non valida.' })
    return
  }

  const resolved = await resolveUserFromTelegram(telegramUserId)
  if (!resolved) {
    await answerCallbackQuery({ callbackQueryId: cb.id, text: 'Account non collegato.', showAlert: true })
    return
  }

  if (!TELEGRAM_ENV.writesEnabled() && parsed.action === 'confirm') {
    await answerCallbackQuery({ callbackQueryId: cb.id, text: 'Scritture disabilitate.' })
    await sendTelegramMessage({
      chatId,
      text: 'Le scritture Telegram non sono attive. Usa il gestionale web.',
    })
    return
  }

  const thread = await getOrCreateTelegramThread(resolved.user.id, chatId)

  const result = await runWithRequestActorAsync(resolved.user, async () => {
    if (parsed.action === 'confirm') {
      return confirmAssistantV2Action({
        user: resolved.user,
        threadId: thread.id,
        pendingId: parsed.pendingId,
      })
    }
    return cancelAssistantV2Action({
      user: resolved.user,
      threadId: thread.id,
      pendingId: parsed.pendingId,
    })
  })

  await answerCallbackQuery({
    callbackQueryId: cb.id,
    text: parsed.action === 'confirm' ? 'Confermato' : 'Annullato',
  })

  const formatted = formatAssistantForTelegram(result)
  await sendTelegramMessage({
    chatId,
    text: formatted.text,
    replyMarkup: formatted.replyMarkup,
  })

  await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: 'assistant',
      content: formatted.text.slice(0, 8000),
      metadata: { callback: parsed.action, pendingId: parsed.pendingId },
    },
  })
}
