'use client'

import dynamic from 'next/dynamic'
import type { Work } from '@prisma/client'
import type { Client } from '@prisma/client'
import type { Category } from '@prisma/client'

const CalendarView = dynamic(
  () => import('./calendar-view').then((m) => ({ default: m.CalendarView })),
  { ssr: false, loading: () => <div className="text-white/60 py-8">Caricamento calendario…</div> }
)

type Props = {
  works: (Work & { client: Client; category: Category })[]
  initialRange?: string
  initialFrom: string
  initialTo: string
  isCalendarAdmin: boolean
}

export function CalendarViewDynamic(props: Props) {
  return <CalendarView {...props} />
}
