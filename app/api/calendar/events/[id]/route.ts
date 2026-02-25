import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-dev'
import { getCurrentUser } from '@/lib/auth-dev'
import { updateEvent, deleteEvent } from '@/lib/googleCalendar'
import { z } from 'zod'

const calendarAdminIds = (process.env.CALENDAR_ADMIN_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function canWriteCalendar(clerkUserId: string | null): boolean {
  return clerkUserId ? calendarAdminIds.includes(clerkUserId) : false
}

const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
}).refine(
  (d) => {
    if (d.start && d.end) return new Date(d.end) > new Date(d.start)
    return true
  },
  { message: 'La data/ora fine deve essere dopo l\'inizio', path: ['end'] }
)

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const clerkUserId = await getAuthUserId()
    const user = await getCurrentUser()
    if (!user || !clerkUserId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    if (!canWriteCalendar(clerkUserId)) {
      return NextResponse.json({ error: 'Non hai permesso di modificare eventi' }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'ID evento mancante' }, { status: 400 })

    const body = await request.json()
    const parsed = updateEventSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors ? Object.values(parsed.error.flatten().fieldErrors).flat().join(' ') : 'Dati non validi' },
        { status: 400 }
      )
    }

    const event = await updateEvent(id, parsed.data)
    return NextResponse.json(event)
  } catch (err) {
    console.error('[PATCH /api/calendar/events/:id]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Errore nell\'aggiornamento evento' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const clerkUserId = await getAuthUserId()
    const user = await getCurrentUser()
    if (!user || !clerkUserId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    if (!canWriteCalendar(clerkUserId)) {
      return NextResponse.json({ error: 'Non hai permesso di eliminare eventi' }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'ID evento mancante' }, { status: 400 })

    await deleteEvent(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/calendar/events/:id]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Errore nell\'eliminazione evento' },
      { status: 500 }
    )
  }
}
