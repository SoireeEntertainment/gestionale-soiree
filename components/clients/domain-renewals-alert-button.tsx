'use client'

import { useState } from 'react'
import { LoadingButton } from '@/components/ui/loading-button'
import { sendDomainRenewalsAlertEmailAction } from '@/app/actions/domain-renewals-alert'
import { dismissToast, showToast } from '@/lib/toast'

export function DomainRenewalsAlertButton() {
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (sending) return
    setSending(true)
    const toastId = showToast('Invio alert rinnovi…', 'loading')
    try {
      const result = await sendDomainRenewalsAlertEmailAction()
      if (!result.success) {
        showToast(result.error, 'error')
        return
      }
      if (result.count > 0) {
        showToast(`Alert inviato: ${result.count} domini in scadenza`, 'success')
      } else {
        showToast('Alert inviato: nessun dominio in scadenza nei prossimi 2 mesi', 'success')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore durante l\'invio dell\'alert rinnovi'
      showToast(msg, 'error')
    } finally {
      dismissToast(toastId)
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
      loadingText="Invio…"
      disabled={sending}
    >
      Manda Alert Rinnovi
    </LoadingButton>
  )
}
