'use client'

import { useState } from 'react'
import { Work, Client, Category } from '@prisma/client'
import { ProfileCalendar } from './profile-calendar'

type WorkWithRelations = Work & { client: Client; category: Category }

export function ProfileCalendarClient({
  works,
}: {
  works: WorkWithRelations[]
}) {
  const [range, setRange] = useState<'today' | '7days' | '30days'>('7days')

  return (
    <ProfileCalendar
      works={works}
      range={range}
      onRangeChange={setRange}
    />
  )
}
