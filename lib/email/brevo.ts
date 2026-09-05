import { BrevoClient, BrevoError } from '@getbrevo/brevo'
import {
  getBrevoApiKey,
  getEmailSender,
  TRANSACTIONAL_EMAIL_SENDER_NAME,
} from '@/lib/email-env'

export type SendEmailParams = {
  to: string
  subject: string
  html: string
  text: string
}

let brevoClient: BrevoClient | null = null

function getClient(): BrevoClient {
  if (!brevoClient) {
    brevoClient = new BrevoClient({ apiKey: getBrevoApiKey() })
  }
  return brevoClient
}

function extractProviderMeta(err: BrevoError): {
  providerCode?: string
  providerMessage?: string
} {
  const body = err.body
  if (!body || typeof body !== 'object') return {}

  const record = body as Record<string, unknown>
  const providerCode =
    typeof record.code === 'string'
      ? record.code
      : typeof record.errorCode === 'string'
        ? record.errorCode
        : undefined
  const providerMessage =
    typeof record.message === 'string'
      ? record.message
      : typeof record.error === 'string'
        ? record.error
        : undefined

  return { providerCode, providerMessage }
}

function toClientErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message
    if (
      msg.includes('BREVO_API_KEY') ||
      msg.includes('EMAIL_FROM') ||
      msg.includes('non configurata')
    ) {
      return 'Configurazione email incompleta.'
    }
  }

  if (!(err instanceof BrevoError)) {
    if (err instanceof Error && err.message.trim()) {
      return 'Errore provider email: invio non riuscito'
    }
    return 'Errore provider email: invio non riuscito'
  }

  const statusCode = err.statusCode
  const { providerCode, providerMessage } = extractProviderMeta(err)
  const haystack = [
    err.message,
    providerCode,
    providerMessage,
    typeof err.body === 'string' ? err.body : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (
    statusCode === 401 ||
    haystack.includes('unrecognised ip') ||
    haystack.includes('unrecognized ip') ||
    haystack.includes('ip address') ||
    haystack.includes('unauthorized')
  ) {
    return 'Brevo ha rifiutato l’invio. Verifica configurazione API e IP autorizzati.'
  }

  if (
    statusCode === 403 ||
    haystack.includes('sender') ||
    haystack.includes('from email') ||
    haystack.includes('mittente')
  ) {
    return 'Il mittente configurato non è autorizzato su Brevo.'
  }

  if (statusCode === 400) {
    return 'Brevo ha rifiutato il payload email (richiesta non valida).'
  }

  if (statusCode === 429) {
    return 'Limite di invio Brevo raggiunto. Riprova tra poco.'
  }

  return 'Errore provider email: invio non riuscito'
}

function logBrevoFailure(err: unknown): void {
  if (err instanceof BrevoError) {
    const { providerCode, providerMessage } = extractProviderMeta(err)
    console.error('[BrevoEmail]', {
      statusCode: err.statusCode,
      message: err.message,
      ...(providerCode ? { providerCode } : {}),
      ...(providerMessage ? { providerMessage } : {}),
    })
    return
  }

  console.error('[BrevoEmail]', {
    message: err instanceof Error ? err.message : String(err),
  })
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailParams): Promise<{ messageId?: string }> {
  const { email } = getEmailSender()

  try {
    const response = await getClient().transactionalEmails.sendTransacEmail({
      sender: {
        email,
        name: TRANSACTIONAL_EMAIL_SENDER_NAME,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    })

    const data = 'data' in response && response.data != null ? response.data : response
    const messageId =
      typeof data === 'object' && data !== null && 'messageId' in data
        ? String((data as { messageId?: string }).messageId ?? '')
        : undefined

    return { messageId: messageId || undefined }
  } catch (err) {
    logBrevoFailure(err)
    throw new Error(toClientErrorMessage(err))
  }
}
