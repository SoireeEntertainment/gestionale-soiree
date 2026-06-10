/** Validazione env per invio email via Resend (senza loggare segreti). */

export function logEmailEnvCheck(context: string): void {
  console.log(`[${context}] env check`, {
    hasResendApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
    hasEmailFrom: Boolean(process.env.EMAIL_FROM?.trim()),
    hasAppUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
  })
}

export function getResendApiKey(): string {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) throw new Error('RESEND_API_KEY non configurata')
  return key
}

export function getEmailFrom(): string {
  const from = process.env.EMAIL_FROM?.trim()
  if (!from) throw new Error('EMAIL_FROM non configurata')
  return from
}
