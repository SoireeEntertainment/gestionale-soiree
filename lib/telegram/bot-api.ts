import { TELEGRAM_ENV, TELEGRAM_LIMITS } from '@/lib/telegram/config'
import type { TelegramReplyMarkup } from '@/lib/telegram/types'

type ApiResult<T> = { ok: true; result: T } | { ok: false; description: string; error_code?: number }

function apiBase(): string {
  const token = TELEGRAM_ENV.botToken()
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')
  return `https://api.telegram.org/bot${token}`
}

function fileBase(): string {
  const token = TELEGRAM_ENV.botToken()
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing')
  return `https://api.telegram.org/file/bot${token}`
}

async function callApi<T>(
  method: string,
  body?: Record<string, unknown>,
  attempt = 1
): Promise<ApiResult<T>> {
  const res = await fetch(`${apiBase()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 429 && attempt < 4) {
    const retryAfter = Number(res.headers.get('retry-after') || '1')
    await new Promise((r) => setTimeout(r, Math.min(5000, (retryAfter || 1) * 1000)))
    return callApi<T>(method, body, attempt + 1)
  }

  let data: { ok?: boolean; result?: T; description?: string; error_code?: number }
  try {
    data = (await res.json()) as typeof data
  } catch {
    return { ok: false, description: `Telegram API HTTP ${res.status}` }
  }

  if (!data.ok) {
    return {
      ok: false,
      description: data.description || `Telegram error ${res.status}`,
      error_code: data.error_code,
    }
  }
  return { ok: true, result: data.result as T }
}

export async function sendTelegramMessage(input: {
  chatId: string | number
  text: string
  replyMarkup?: TelegramReplyMarkup
  parseMode?: 'HTML' | 'Markdown'
}): Promise<ApiResult<{ message_id: number }>> {
  const text = input.text.slice(0, TELEGRAM_LIMITS.telegramMessageMax)
  return callApi('sendMessage', {
    chat_id: input.chatId,
    text,
    disable_web_page_preview: true,
    ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
    ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
  })
}

export async function answerCallbackQuery(input: {
  callbackQueryId: string
  text?: string
  showAlert?: boolean
}): Promise<ApiResult<true>> {
  return callApi('answerCallbackQuery', {
    callback_query_id: input.callbackQueryId,
    text: input.text,
    show_alert: input.showAlert ?? false,
  })
}

export async function getTelegramFile(fileId: string): Promise<
  ApiResult<{ file_id: string; file_unique_id: string; file_size?: number; file_path?: string }>
> {
  return callApi('getFile', { file_id: fileId })
}

export async function downloadTelegramFile(filePath: string): Promise<Buffer> {
  const res = await fetch(`${fileBase()}/${filePath}`)
  if (!res.ok) throw new Error(`Download file failed: ${res.status}`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

/** Non logga mai il token. */
export function telegramLog(event: string, meta?: Record<string, unknown>) {
  const safe = { ...meta }
  for (const k of Object.keys(safe)) {
    const v = safe[k]
    if (typeof v === 'string' && (v.includes('bot') || v.length > 80)) {
      // strip accidental secrets
      if (/^\d+:[A-Za-z0-9_-]+$/.test(v)) safe[k] = '[redacted]'
    }
  }
  console.info('[telegram]', event, safe)
}
