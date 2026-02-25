/**
 * Google Calendar API client via Service Account.
 * Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_CALENDAR_ID
 */

import { google } from 'googleapis'
import type { calendar_v3 } from 'googleapis'

export type CalendarEvent = {
  id: string
  title: string
  start: string // ISO
  end: string // ISO
  allDay: boolean
  location?: string
  description?: string
}

export type CreateEventPayload = {
  title: string
  start: string
  end: string
  allDay: boolean
  location?: string
  description?: string
}

export type UpdateEventPayload = Partial<CreateEventPayload>

function getCalendarClient() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'

  if (!clientEmail || !privateKey) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are required')
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })

  const calendar = google.calendar({ version: 'v3', auth })
  return { calendar, calendarId }
}

function normalizeEvent(item: calendar_v3.Schema$Event): CalendarEvent | null {
  if (!item.id) return null
  const summary = item.summary ?? ''
  let start = ''
  let end = ''
  let allDay = false

  if (item.start?.date) {
    allDay = true
    start = item.start.date
    end = item.end?.date ?? item.start.date
  } else if (item.start?.dateTime && item.end?.dateTime) {
    start = item.start.dateTime
    end = item.end.dateTime
  } else {
    return null
  }

  return {
    id: item.id,
    title: summary,
    start,
    end,
    allDay,
    location: item.location ?? undefined,
    description: item.description ?? undefined,
  }
}

/**
 * List events in a time range (ISO strings for timeMin/timeMax).
 */
export async function listEvents(options: {
  timeMin: string
  timeMax: string
}): Promise<CalendarEvent[]> {
  const { calendar, calendarId } = getCalendarClient()
  const res = await calendar.events.list({
    calendarId,
    timeMin: options.timeMin,
    timeMax: options.timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  })
  const items = res.data.items ?? []
  return items.map(normalizeEvent).filter((e): e is CalendarEvent => e !== null)
}

/**
 * Create an event. All-day: use start.date / end.date (end exclusive, e.g. 1 day = end day+1).
 */
export async function createEvent(payload: CreateEventPayload): Promise<CalendarEvent> {
  const { calendar, calendarId } = getCalendarClient()

  const body: calendar_v3.Schema$Event = {
    summary: payload.title,
    location: payload.location,
    description: payload.description,
  }

  if (payload.allDay) {
    body.start = { date: payload.start.slice(0, 10) }
    body.end = { date: payload.end.slice(0, 10) }
  } else {
    body.start = { dateTime: payload.start }
    body.end = { dateTime: payload.end }
  }

  const res = await calendar.events.insert({
    calendarId,
    requestBody: body,
  })

  const event = normalizeEvent(res.data)
  if (!event) throw new Error('Failed to create event')
  return event
}

/**
 * Update an event (partial payload).
 */
export async function updateEvent(
  eventId: string,
  payload: UpdateEventPayload
): Promise<CalendarEvent> {
  const { calendar, calendarId } = getCalendarClient()

  const existing = await calendar.events.get({ calendarId, eventId: eventId })
  const current = existing.data
  if (!current) throw new Error('Event not found')

  const body: calendar_v3.Schema$Event = {
    summary: payload.title ?? current.summary,
    location: payload.location !== undefined ? payload.location : current.location,
    description: payload.description !== undefined ? payload.description : current.description,
  }

  if (payload.allDay !== undefined) {
    if (payload.allDay) {
      body.start = { date: (payload.start ?? current.start?.date ?? current.start?.dateTime)?.toString().slice(0, 10) }
      body.end = { date: (payload.end ?? current.end?.date ?? current.end?.dateTime)?.toString().slice(0, 10) }
    } else {
      body.start = { dateTime: (payload.start ?? current.start?.dateTime ?? current.start?.date)?.toString() }
      body.end = { dateTime: (payload.end ?? current.end?.dateTime ?? current.end?.date)?.toString() }
    }
  } else if (payload.start !== undefined || payload.end !== undefined) {
    const start = payload.start ?? (current.start?.dateTime ?? current.start?.date)?.toString()
    const end = payload.end ?? (current.end?.dateTime ?? current.end?.date)?.toString()
    if (current.start?.date) {
      body.start = { date: start?.slice(0, 10) }
      body.end = { date: end?.slice(0, 10) }
    } else {
      body.start = { dateTime: start }
      body.end = { dateTime: end }
    }
  } else {
    body.start = current.start
    body.end = current.end
  }

  const res = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: body,
  })

  const event = normalizeEvent(res.data)
  if (!event) throw new Error('Failed to update event')
  return event
}

/**
 * Delete an event.
 */
export async function deleteEvent(eventId: string): Promise<void> {
  const { calendar, calendarId } = getCalendarClient()
  await calendar.events.delete({ calendarId, eventId })
}
