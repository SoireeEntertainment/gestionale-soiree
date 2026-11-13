import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TELEGRAM_LIMITS } from '@/lib/telegram/config'
import { transcribeTelegramVoice } from '@/lib/telegram/voice'

describe('telegram voice guards', () => {
  it('rifiuta durata eccessiva senza chiamare OpenAI', async () => {
    const res = await transcribeTelegramVoice({
      file_id: 'x',
      file_unique_id: 'y',
      duration: TELEGRAM_LIMITS.maxVoiceDurationSec + 10,
      mime_type: 'audio/ogg',
      file_size: 1000,
    })
    assert.equal(res.ok, false)
    if (!res.ok) assert.match(res.error, /lungo/i)
  })

  it('rifiuta size eccessiva', async () => {
    const res = await transcribeTelegramVoice({
      file_id: 'x',
      file_unique_id: 'y',
      duration: 5,
      mime_type: 'audio/ogg',
      file_size: TELEGRAM_LIMITS.maxVoiceBytes + 1,
    })
    assert.equal(res.ok, false)
  })

  it('rifiuta mime non audio', async () => {
    const res = await transcribeTelegramVoice({
      file_id: 'x',
      file_unique_id: 'y',
      duration: 5,
      mime_type: 'application/pdf',
      file_size: 100,
    })
    assert.equal(res.ok, false)
  })
})
