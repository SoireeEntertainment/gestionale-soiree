'use client'

import { useState } from 'react'
import { LoadingButton } from '@/components/ui/loading-button'
import { sendDomainRenewalsAlertEmailAction } from '@/app/actions/domain-renewals-alert'
import { showToast } from '@/lib/toast'

const ALERT_RECIPIENT = 'soiree.teamwork@gmail.com'

export function DomainRenewalsAlertButton() {
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (sending) return
    setSending(true)
    showToast('Invio alert rinnovi…', 'loading')
    try {
      const result = await sendDomainRenewalsAlertEmailAction()
      const to = result.sentTo || ALERT_RECIPIENT
      showToast(`Alert rinnovi inviato a ${to}`, 'success')
    } catch {
      showToast('Errore durante l\'invio dell\'alert rinnovi', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <LoadingButton
      type="button"
      variant="secondary"
      className="border-accent/30 text-accent shrink-0"
      onClick={handleSend}
      loading={sending}
      loadingText="Invio..."
    >
      Manda Alert Rinnovi
    </LoadingButton>
  )
}
