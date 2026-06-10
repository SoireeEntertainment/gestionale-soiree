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

function toProviderErrorMessage(err: unknown): string {
  if (err instanceof BrevoError) {
    return `Errore provider email: ${err.message}`
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message
  }
  return 'Errore provider email: invio non riuscito'
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
    console.error('[BrevoEmail]', {
      message: err instanceof Error ? err.message : String(err),
      statusCode: err instanceof BrevoError ? err.statusCode : undefined,
    })
    throw new Error(toProviderErrorMessage(err))
  }
}
