'use server'

import { getCurrentUser } from '@/lib/auth-dev'
import { sendDomainRenewalsAlertEmail } from '@/lib/domain-renewals-alert'

export type DomainRenewalsAlertActionResult =
  | { success: true; count: number; sentTo: string }
  | { success: false; error: string }

function toClientErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  return 'Errore durante l\'invio dell\'alert rinnovi'
}

export async function sendDomainRenewalsAlertEmailAction(): Promise<DomainRenewalsAlertActionResult> {
  const user = await getCurrentUser()
  if (!user) {
    return { success: false, error: 'Non autorizzato' }
  }

  try {
    const result = await sendDomainRenewalsAlertEmail()
    return { success: true, count: result.count, sentTo: result.sentTo }
  } catch (err) {
    console.error('[DomainRenewalsAlert] error', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      cause: err instanceof Error ? err.cause : undefined,
    })
    return { success: false, error: toClientErrorMessage(err) }
  }
}
