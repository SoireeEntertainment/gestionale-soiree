/** Validazione env per invio email via Brevo (senza loggare segreti). */

/** Nome mittente uniforme per tutte le email transazionali del gestionale. */
export const TRANSACTIONAL_EMAIL_SENDER_NAME = 'Soirëe Studio'

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

function parseEmailAddress(raw: string): string {
  const angleMatch = raw.match(/^(.+?)\s*<([^>]+)>$/)
  if (angleMatch) return angleMatch[2].trim()
  return raw
}

/** Sender Brevo: indirizzo da EMAIL_FROM, nome sempre "Soirëe Studio". */
export function getEmailSender(): { email: string; name: string } {
  return {
    email: parseEmailAddress(getEmailFrom()),
    name: TRANSACTIONAL_EMAIL_SENDER_NAME,
  }
}
