import { addMonths, endOfDay, startOfDay } from 'date-fns'
import { sendEmail } from '@/lib/email/brevo'
import { assertEmailEnvReady, logEmailEnvCheck } from '@/lib/email-env'
import { formatDateOnlyIt } from '@/lib/date-only'
import { isDomainRenewalService, parseDomainFromServiceName } from '@/lib/domain-renewal-utils'
import { prisma } from '@/lib/prisma'

export const DOMAIN_RENEWALS_ALERT_RECIPIENT =
  process.env.DOMAIN_RENEWALS_ALERT_TO?.trim() || 'soiree.teamwork@gmail.com'

export type DomainRenewalAlertItem = {
  clientId: string
  clientName: string
  domain: string
  renewalDate: Date
  renewalId: string
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000'
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

function formatRenewalDate(date: Date): string {
  return formatDateOnlyIt(date)
}

/** Domini con rinnovo tra oggi e oggi + 2 mesi (inclusi). */
export async function getDomainRenewalsExpiringInNextTwoMonths(): Promise<DomainRenewalAlertItem[]> {
  const rangeStart = startOfDay(new Date())
  const rangeEnd = endOfDay(addMonths(rangeStart, 2))

  const rows = await prisma.clientRenewal.findMany({
    where: {
      renewalDate: {
        gte: rangeStart,
        lte: rangeEnd,
      },
    },
    include: {
      client: { select: { id: true, name: true } },
    },
    orderBy: { renewalDate: 'asc' },
  })

  const items: DomainRenewalAlertItem[] = []

  for (const row of rows) {
    if (!isDomainRenewalService(row.serviceName)) continue
    const domain = parseDomainFromServiceName(row.serviceName)
    if (!domain) continue

    items.push({
      clientId: row.client.id,
      clientName: row.client.name,
      domain,
      renewalDate: row.renewalDate,
      renewalId: row.id,
    })
  }

  return items
}

export function buildDomainRenewalsAlertEmail(items: DomainRenewalAlertItem[]): {
  subject: string
  html: string
  text: string
} {
  const subject = 'Alert rinnovi domini - prossimi 2 mesi'
  const appUrl = getAppUrl()

  if (items.length === 0) {
    const html = `
  <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;background:#f8fafc;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <h2 style="margin:0 0 12px 0;font-size:20px;">Domini in scadenza nei prossimi 2 mesi</h2>
      <p style="margin:0 0 16px 0;">Ecco l'elenco dei domini dei clienti con data di rinnovo compresa nei prossimi due mesi.</p>
      <p style="margin:0 0 24px 0;color:#374151;">Nessun dominio in scadenza nei prossimi due mesi.</p>
      <a href="${appUrl}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Apri gestionale</a>
    </div>
  </div>`

    const text = [
      'Domini in scadenza nei prossimi 2 mesi',
      '',
      "Ecco l'elenco dei domini dei clienti con data di rinnovo compresa nei prossimi due mesi.",
      '',
      'Nessun dominio in scadenza nei prossimi due mesi.',
      '',
      `Apri gestionale: ${appUrl}`,
    ].join('\n')

    return { subject, html, text }
  }

  const tableRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.clientName)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.domain)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatRenewalDate(item.renewalDate))}</td>
      </tr>`
    )
    .join('')

  const html = `
  <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;background:#f8fafc;padding:24px;">
    <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <h2 style="margin:0 0 12px 0;font-size:20px;">Domini in scadenza nei prossimi 2 mesi</h2>
      <p style="margin:0 0 20px 0;color:#374151;">Ecco l'elenco dei domini dei clienti con data di rinnovo compresa nei prossimi due mesi.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Cliente</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Dominio</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Data rinnovo</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p style="margin:20px 0 0 0;color:#6b7280;font-size:13px;">Totale: ${items.length} dominio/i</p>
      <div style="margin-top:24px;">
        <a href="${appUrl}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Apri gestionale</a>
      </div>
    </div>
  </div>`

  const textLines = [
    'Domini in scadenza nei prossimi 2 mesi',
    '',
    "Ecco l'elenco dei domini dei clienti con data di rinnovo compresa nei prossimi due mesi.",
    '',
    ...items.map(
      (item) =>
        `${item.clientName} | ${item.domain} | ${formatRenewalDate(item.renewalDate)}`
    ),
    '',
    `Totale: ${items.length}`,
    '',
    `Apri gestionale: ${appUrl}`,
  ]

  return { subject, html, text: textLines.join('\n') }
}

export async function sendDomainRenewalsAlertEmail(): Promise<{
  success: boolean
  count: number
  sentTo: string
}> {
  let phase = 'start'
  console.log('[DomainRenewalsAlert] START')

  try {
    phase = 'env'
    logEmailEnvCheck('DomainRenewalsAlert')
    assertEmailEnvReady()
    console.log('[DomainRenewalsAlert] ENV_OK')

    const sentTo = DOMAIN_RENEWALS_ALERT_RECIPIENT

    phase = 'query'
    const items = await getDomainRenewalsExpiringInNextTwoMonths()
    console.log(`[DomainRenewalsAlert] QUERY_OK count=${items.length}`)

    phase = 'email_build'
    const { subject, html, text } = buildDomainRenewalsAlertEmail(items)
    console.log('[DomainRenewalsAlert] EMAIL_BUILD_OK')

    phase = 'brevo_send'
    console.log('[DomainRenewalsAlert] BREVO_SEND_START')
    const { messageId } = await sendEmail({
      to: sentTo,
      subject,
      html,
      text,
    })

    console.log(`[DomainRenewalsAlert] SENT messageId=${messageId ?? 'n/a'}`)

    return { success: true, count: items.length, sentTo }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[DomainRenewalsAlert] FAILED phase=${phase}`, { message })
    throw err instanceof Error ? err : new Error(message)
  }
}
