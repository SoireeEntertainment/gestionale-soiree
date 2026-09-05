'use server'

import { getCurrentUser, canWrite } from '@/lib/auth-dev'
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
  if (!user || !canWrite(user)) {
    return { success: false, error: 'Non autorizzato' }
  }

  try {
    const result = await sendDomainRenewalsAlertEmail()
    return { success: true, count: result.count, sentTo: result.sentTo }
  } catch (err) {
    console.error('[DomainRenewalsAlert] action error', {
      message: err instanceof Error ? err.message : String(err),
    })
    return { success: false, error: toClientErrorMessage(err) }
  }
}
