/**
 * Google Calendar API client via Service Account.
 * Env (in ordine di preferenza):
 * 1) GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 (JSON intero in base64)
 * 2) GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 + opzionale client_email nel JSON
 * 3) GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 * + GOOGLE_CALENDAR_ID, CALENDAR_ADMIN_USER_IDS
 */

import { google } from 'googleapis'
import type { calendar_v3 } from 'googleapis'

export type CalendarEvent = {
  id: string
  title: string
  start: string
  end: string
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

const PEM_HEADERS = ['BEGIN PRIVATE KEY', 'BEGIN RSA PRIVATE KEY']

function stripWrappingQuotes(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

function normalizePem(key: string): string {
  let out = stripWrappingQuotes(key)
  out = out.replace(/\\n/g, '\n')
  return out.trim()
}

function hasPemHeader(key: string): boolean {
  return PEM_HEADERS.some((h) => key.includes(h))
}

/** Safe log: never the full key; length + masked prefix + header presence. */
function logKeySafe(label: string, key: string): void {
  const len = key.length
  const prefix = key.slice(0, 20).replace(/[\s\S]/g, '*') + '***'
  const hasHeader = hasPemHeader(key)
  console.log(`[googleCalendar] ${label} length=${len} prefix=${prefix} hasPemHeader=${hasHeader}`)
}

/**
 * Returns { clientEmail, privateKey } from env.
 * Prefer: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 > GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 > EMAIL + PRIVATE_KEY.
 * Validates PEM header; throws with clear message if missing or malformed (never logs full key).
 */
export function getGoogleCredentials(): { clientEmail: string; privateKey: string } {
  // 1) JSON intero in base64 (metodo consigliato su Vercel)
  const jsonBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim()
  if (jsonBase64) {
    try {
      const decoded = Buffer.from(jsonBase64, 'base64').toString('utf8')
      const data = JSON.parse(decoded) as { client_email?: string; private_key?: string }
      const email = data.client_email?.trim()
      const rawKey = data.private_key?.trim()
      if (!email || !rawKey) {
        throw new Error('Google Calendar credentials misconfigured: JSON base64 missing client_email or private_key')
      }
      const privateKey = normalizePem(rawKey)
      if (!hasPemHeader(privateKey)) {
        logKeySafe('json_base64 key', privateKey)
        throw new Error('Google Calendar credentials misconfigured: malformed PEM header')
      }
      return { clientEmail: email, privateKey }
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error('Google Calendar credentials misconfigured: invalid JSON in GOOGLE_SERVICE_ACCOUNT_JSON_BASE64')
      }
      throw e
    }
  }

  // 2) Key (o JSON parziale) in base64
  const keyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64?.trim()
  if (keyBase64) {
    try {
      const decoded = Buffer.from(keyBase64, 'base64').toString('utf8')
      let privateKey: string
      let clientEmail: string | undefined
      if (decoded.includes('"private_key"') && decoded.includes('{')) {
        try {
          const data = JSON.parse(decoded) as { client_email?: string; private_key?: string }
          clientEmail = data.client_email?.trim()
          privateKey = normalizePem((data.private_key ?? '').trim())
        } catch {
          privateKey = normalizePem(decoded)
        }
      } else {
        privateKey = normalizePem(decoded)
      }
      if (!hasPemHeader(privateKey)) {
        logKeySafe('key_base64', privateKey)
        throw new Error('Google Calendar credentials misconfigured: malformed PEM header')
      }
      const email = clientEmail ?? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
      if (!email) {
        throw new Error('Google Calendar credentials misconfigured: missing env GOOGLE_SERVICE_ACCOUNT_EMAIL')
      }
      return { clientEmail: email, privateKey }
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error('Google Calendar credentials misconfigured: invalid base64 or JSON in GOOGLE_SERVICE_ACCOUNT_KEY_BASE64')
      }
      throw e
    }
  }

  // 3) Fallback: EMAIL + PRIVATE_KEY
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim()
  if (!clientEmail || !rawKey) {
    throw new Error('Google Calendar credentials misconfigured: missing env (set GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 or EMAIL + PRIVATE_KEY)')
  }
  const privateKey = normalizePem(rawKey)
  if (!hasPemHeader(privateKey)) {
    logKeySafe('private_key env', privateKey)
    throw new Error('Google Calendar credentials misconfigured: malformed PEM header')
  }
  return { clientEmail, privateKey }
}

function getCalendarClient() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'
  const { clientEmail, privateKey } = getGoogleCredentials()

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
