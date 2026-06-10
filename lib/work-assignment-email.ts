import { sendEmail } from '@/lib/email/brevo'

type WorkEmailData = {
  id: string
  title: string
  description?: string | null
  status: string
  priority?: string | null
  deadline?: Date | null
  client: { name: string }
  category: { name: string }
}

type WorkRecipient = {
  id: string
  name: string
  email: string
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatWorkStatusLabel(status: string): string {
  const key = status.trim().toUpperCase()
  if (key === 'TODO' || key === 'DA_FARE') return 'Da fare'
  if (key === 'IN_PROGRESS' || key === 'IN_CORSO') return 'In corso'
  if (key === 'IN_REVIEW' || key === 'IN_REVISIONE') return 'In revisione'
  if (key === 'WAITING_CLIENT' || key === 'ATTESA_CLIENTE') return 'Attesa cliente'
  if (key === 'DONE' || key === 'FATTO' || key === 'COMPLETATO') return 'Fatto'
  if (key === 'PAUSED' || key === 'IN_PAUSA') return 'In pausa'
  if (key === 'CANCELED' || key === 'ANNULLATO' || key === 'CANCELLED') return 'Annullato'
  return status
}

function formatWorkPriorityLabel(priority?: string | null): string {
  const key = (priority ?? '').trim().toUpperCase()
  if (key === 'LOW') return 'Bassa'
  if (key === 'MEDIUM') return 'Media'
  if (key === 'HIGH') return 'Alta'
  return 'Non impostata'
}

function formatDeadline(deadline?: Date | null): string {
  if (!deadline) return 'Non impostata'
  return deadline.toLocaleDateString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000'
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

export function buildWorkAssignedEmail({
  user,
  work,
  workUrl,
}: {
  user: WorkRecipient
  work: WorkEmailData
  workUrl: string
}): { subject: string; html: string; text: string } {
  const subject = `Nuovo lavoro assegnato: ${work.title}`
  const safeTitle = escapeHtml(work.title)
  const safeUser = escapeHtml(user.name || 'utente')
  const safeClient = escapeHtml(work.client.name)
  const safeCategory = escapeHtml(work.category.name)
  const safeStatus = escapeHtml(formatWorkStatusLabel(work.status))
  const safePriority = escapeHtml(formatWorkPriorityLabel(work.priority))
  const safeDeadline = escapeHtml(formatDeadline(work.deadline))
  const safeDesc = work.description?.trim() ? escapeHtml(work.description.trim()) : ''
  const preview = safeDesc ? `${safeDesc.slice(0, 350)}${safeDesc.length > 350 ? '…' : ''}` : ''

  const html = `
  <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;background:#f8fafc;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <h2 style="margin:0 0 12px 0;font-size:20px;">Nuovo lavoro assegnato</h2>
      <p style="margin:0 0 16px 0;">Ciao ${safeUser},</p>
      <p style="margin:0 0 18px 0;">Ti è stato assegnato un nuovo lavoro nel gestionale Soiree Studio.</p>

      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;background:#f9fafb;">
        <p style="margin:0 0 8px 0;"><strong>Titolo:</strong> ${safeTitle}</p>
        <p style="margin:0 0 8px 0;"><strong>Cliente:</strong> ${safeClient}</p>
        <p style="margin:0 0 8px 0;"><strong>Categoria:</strong> ${safeCategory}</p>
        <p style="margin:0 0 8px 0;"><strong>Stato:</strong> ${safeStatus}</p>
        <p style="margin:0 0 8px 0;"><strong>Priorita:</strong> ${safePriority}</p>
        <p style="margin:0;"><strong>Scadenza:</strong> ${safeDeadline}</p>
      </div>

      ${
        preview
          ? `<div style="margin-top:16px;"><p style="margin:0 0 6px 0;"><strong>Descrizione</strong></p><p style="margin:0;white-space:pre-wrap;">${preview}</p></div>`
          : ''
      }

      <div style="margin-top:24px;">
        <a href="${workUrl}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Apri lavoro</a>
      </div>
      <p style="margin:16px 0 0 0;color:#6b7280;font-size:12px;">Se il pulsante non funziona, copia e incolla questo link nel browser:<br/>${workUrl}</p>
    </div>
  </div>`

  const text = [
    `Ciao ${user.name},`,
    '',
    'Ti è stato assegnato un nuovo lavoro nel gestionale Soiree Studio.',
    '',
    `Titolo: ${work.title}`,
    `Cliente: ${work.client.name}`,
    `Categoria: ${work.category.name}`,
    `Stato: ${formatWorkStatusLabel(work.status)}`,
    `Priorita: ${formatWorkPriorityLabel(work.priority)}`,
    `Scadenza: ${formatDeadline(work.deadline)}`,
    work.description?.trim() ? `Descrizione: ${work.description.trim().slice(0, 350)}` : '',
    '',
    `Apri lavoro: ${workUrl}`,
  ]
    .filter(Boolean)
    .join('\n')

  return { subject, html, text }
}

export async function sendWorkAssignedEmail({
  user,
  work,
}: {
  user: WorkRecipient
  work: WorkEmailData
}) {
  const workUrl = `${getAppUrl()}/works/${work.id}`
  const { subject, html, text } = buildWorkAssignedEmail({ user, work, workUrl })

  await sendEmail({
    to: user.email,
    subject,
    html,
    text,
  })
}
