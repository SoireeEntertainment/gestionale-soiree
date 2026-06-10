'use server'

import { getCurrentUser } from '@/lib/auth-dev'
import { sendDomainRenewalsAlertEmail } from '@/lib/domain-renewals-alert'

export async function sendDomainRenewalsAlertEmailAction(): Promise<{
  success: boolean
  count: number
  sentTo: string
}> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  try {
    return await sendDomainRenewalsAlertEmail()
  } catch (err) {
    console.error('[sendDomainRenewalsAlertEmailAction]', err)
    throw new Error('Errore durante l\'invio dell\'alert rinnovi')
  }
}
