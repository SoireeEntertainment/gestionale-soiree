'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

export function PedMonthNav({
  year,
  month,
  userName,
  children,
}: {
  year: number
  month: number
  userName?: string
  children?: React.ReactNode
}) {
  const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
      <h1 className="text-2xl md:text-3xl font-bold text-white">
        {userName ? `PED di ${userName} · ${monthLabel}` : `PED · ${monthLabel}`}
      </h1>
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <Link href={`/ped?year=${prevMonth.year}&month=${prevMonth.month}`}>
            <Button variant="ghost" size="sm">← Mese precedente</Button>
          </Link>
          <span className="text-white/90 font-medium min-w-[140px] text-center text-sm md:text-base">
            {monthLabel}
          </span>
          <Link href={`/ped?year=${nextMonth.year}&month=${nextMonth.month}`}>
            <Button variant="ghost" size="sm">Mese successivo →</Button>
          </Link>
        </div>
        {children && <div className="flex items-center justify-center gap-2">{children}</div>}
      </div>
    </div>
  )
}
