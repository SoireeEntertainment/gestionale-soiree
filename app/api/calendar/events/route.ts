import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-dev'
import { getCurrentUser } from '@/lib/auth-dev'
import { listEvents, createEvent } from '@/lib/googleCalendar'
import { z } from 'zod'

function isCredentialError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes('Google Calendar credentials') || msg.includes('GOOGLE_') || msg.includes('malformed PEM') || msg.includes('missing env')
}

function safeCalendarErrorDetail(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('missing env') || msg.includes('required')) return 'missing env'
  if (msg.includes('malformed PEM') || msg.includes('PEM header')) return 'malformed PEM header'
  if (msg.includes('invalid JSON') || msg.includes('invalid base64')) return 'invalid base64 or JSON'
  return 'credentials error'
}

const calendarAdminIds = (process.env.CALENDAR_ADMIN_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function canWriteCalendar(clerkUserId: string | null): boolean {
  return clerkUserId ? calendarAdminIds.includes(clerkUserId) : false
}

const createEventSchema = z.object({
  title: z.string().min(1, 'Titolo obbligatorio'),
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.boolean(),
  location: z.string().optional(),
  description: z.string().optional(),
}).refine((d) => new Date(d.end) > new Date(d.start), { message: 'La data/ora fine deve essere dopo l\'inizio', path: ['end'] })

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (!from || !to) {
      return NextResponse.json({ error: 'Parametri from e to (YYYY-MM-DD) obbligatori' }, { status: 400 })
    }
    const timeMin = new Date(from).toISOString()
    const timeMax = new Date(to + 'T23:59:59.999Z').toISOString()
    if (Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime())) {
      return NextResponse.json({ error: 'Date non valide' }, { status: 400 })
    }

    const events = await listEvents({ timeMin, timeMax })
    return NextResponse.json(events)
  } catch (err) {
    console.error('[GET /api/calendar/events]', err)
    if (isCredentialError(err)) {
      return NextResponse.json(
        { error: 'Google Calendar credentials misconfigured', detail: safeCalendarErrorDetail(err) },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Errore nel caricamento eventi' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const clerkUserId = await getAuthUserId()
    const user = await getCurrentUser()
    if (!user || !clerkUserId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    if (!canWriteCalendar(clerkUserId)) {
      return NextResponse.json({ error: 'Non hai permesso di creare eventi nel calendario' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createEventSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors ? Object.values(parsed.error.flatten().fieldErrors).flat().join(' ') : 'Dati non validi' },
        { status: 400 }
      )
    }

    const event = await createEvent(parsed.data)
    return NextResponse.json(event)
  } catch (err) {
    console.error('[POST /api/calendar/events]', err)
    if (isCredentialError(err)) {
      return NextResponse.json(
        { error: 'Google Calendar credentials misconfigured', detail: safeCalendarErrorDetail(err) },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Errore nella creazione evento' },
      { status: 500 }
    )
  }
}
