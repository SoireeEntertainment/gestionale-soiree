/** Validazione env per invio email via Brevo (senza loggare segreti). */

const DEFAULT_SENDER_NAME = 'Soirée Studio'

export function logEmailEnvCheck(context: string): void {
  console.log(`[${context}] env check`, {
    hasBrevoApiKey: Boolean(process.env.BREVO_API_KEY?.trim()),
    hasEmailFrom: Boolean(process.env.EMAIL_FROM?.trim()),
    hasAppUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
  })
}

export function getBrevoApiKey(): string {
  const key = process.env.BREVO_API_KEY?.trim()
  if (!key) throw new Error('BREVO_API_KEY non configurata')
  return key
}

export function getEmailFrom(): string {
  const from = process.env.EMAIL_FROM?.trim()
  if (!from) throw new Error('EMAIL_FROM non configurata')
  return from
}

/** Parse EMAIL_FROM ("Nome <email@domain>" o solo email) per Brevo sender. */
export function getEmailSender(): { email: string; name: string } {
  const raw = getEmailFrom()
  const defaultName = process.env.EMAIL_FROM_NAME?.trim() || DEFAULT_SENDER_NAME

  const angleMatch = raw.match(/^(.+?)\s*<([^>]+)>$/)
  if (angleMatch) {
    const name = angleMatch[1].replace(/^["']|["']$/g, '').trim()
    const email = angleMatch[2].trim()
    return { name: name || defaultName, email }
  }

  return { name: defaultName, email: raw }
}
