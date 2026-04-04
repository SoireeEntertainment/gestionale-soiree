const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

export type ChatMessageForApi = { role: 'system' | 'user' | 'assistant'; content: string }

export async function callOpenAiChat(messages: ChatMessageForApi[], model = 'gpt-4o-mini'): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error('OPENAI_API_KEY non configurata. Aggiungila alle variabili ambiente del progetto.')
  }

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('Risposta OpenAI non valida')
  }
  return content
}
