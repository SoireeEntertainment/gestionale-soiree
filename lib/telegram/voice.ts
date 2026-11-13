import { writeFile, unlink, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TELEGRAM_ENV, TELEGRAM_LIMITS } from '@/lib/telegram/config'
import { downloadTelegramFile, getTelegramFile, telegramLog } from '@/lib/telegram/bot-api'
import type { TelegramVoice } from '@/lib/telegram/types'

const ALLOWED_MIME = new Set([
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'application/ogg',
])

export async function transcribeTelegramVoice(
  voice: TelegramVoice
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (voice.duration > TELEGRAM_LIMITS.maxVoiceDurationSec) {
    return {
      ok: false,
      error: `Messaggio vocale troppo lungo (max ${TELEGRAM_LIMITS.maxVoiceDurationSec}s).`,
    }
  }
  if (voice.file_size && voice.file_size > TELEGRAM_LIMITS.maxVoiceBytes) {
    return { ok: false, error: 'Messaggio vocale troppo grande.' }
  }
  if (voice.mime_type && !ALLOWED_MIME.has(voice.mime_type) && !voice.mime_type.startsWith('audio/')) {
    return { ok: false, error: 'Formato audio non supportato.' }
  }
  if (!TELEGRAM_ENV.botToken()) {
    return { ok: false, error: 'Bot non configurato.' }
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return { ok: false, error: 'Trascrizione non disponibile (manca OPENAI_API_KEY).' }

  const fileMeta = await getTelegramFile(voice.file_id)
  if (!fileMeta.ok || !fileMeta.result.file_path) {
    return { ok: false, error: 'Impossibile scaricare il vocale da Telegram.' }
  }
  if (fileMeta.result.file_size && fileMeta.result.file_size > TELEGRAM_LIMITS.maxVoiceBytes) {
    return { ok: false, error: 'Messaggio vocale troppo grande.' }
  }

  let tmpDir: string | null = null
  let tmpPath: string | null = null
  try {
    const buf = await downloadTelegramFile(fileMeta.result.file_path)
    if (buf.byteLength > TELEGRAM_LIMITS.maxVoiceBytes) {
      return { ok: false, error: 'Messaggio vocale troppo grande.' }
    }

    tmpDir = await mkdtemp(join(tmpdir(), 'soiree-tg-voice-'))
    const ext = fileMeta.result.file_path.split('.').pop() || 'ogg'
    tmpPath = join(tmpDir, `voice.${ext}`)
    await writeFile(tmpPath, buf)

    // Preferisci gpt-transcribe se supportato; fallback whisper-1.
    const model = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || 'gpt-4o-mini-transcribe'
    const form = new FormData()
    const bytes = new Uint8Array(buf)
    const blob = new Blob([bytes], { type: voice.mime_type || 'audio/ogg' })
    form.append('file', blob, `voice.${ext}`)
    form.append('model', model)
    form.append('language', 'it')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45_000)
    let res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok && (res.status === 400 || res.status === 404)) {
      // Fallback modello classico ancora supportato
      const form2 = new FormData()
      form2.append('file', blob, `voice.${ext}`)
      form2.append('model', 'whisper-1')
      form2.append('language', 'it')
      res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form2,
      })
    }

    if (!res.ok) {
      telegramLog('transcribe_failed', { status: res.status })
      return { ok: false, error: 'Errore di trascrizione. Riprova o scrivi il messaggio.' }
    }

    const data = (await res.json()) as { text?: string }
    const text = (data.text || '').trim()
    if (!text) {
      return { ok: false, error: 'Trascrizione vuota. Ripeti il vocale o scrivi il messaggio.' }
    }
    return { ok: true, text }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    telegramLog('transcribe_error', { aborted, message: e instanceof Error ? e.message : 'unknown' })
    return {
      ok: false,
      error: aborted
        ? 'Trascrizione in timeout. Riprova con un vocale più breve.'
        : 'Errore di trascrizione. Riprova o scrivi il messaggio.',
    }
  } finally {
    if (tmpPath) {
      try {
        await unlink(tmpPath)
      } catch {
        /* ignore */
      }
    }
    if (tmpDir) {
      try {
        await rm(tmpDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  }
}
