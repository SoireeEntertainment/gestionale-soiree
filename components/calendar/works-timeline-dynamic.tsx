'use client'

import dynamic from 'next/dynamic'
import type { Client, Category, User } from '@prisma/client'
import type { WorksTimelineResult } from '@/app/actions/works-timeline'
import type { TimelineViewUnit } from '@/lib/timeline-range'

const WorksTimelineView = dynamic(
  () => import('./works-timeline-view').then((m) => ({ default: m.WorksTimelineView })),
  { ssr: false, loading: () => <div className="text-white/60 py-8">Caricamento timeline…</div> }
)

type Props = {
  data: WorksTimelineResult
  rangeStart: string
  rangeEnd: string
  rangeLabel: string
  view: TimelineViewUnit
  anchor: string
  clients: Client[]
  categories: Category[]
  users: User[]
  filters: {
    clientId?: string
    categoryId?: string
    status?: string
    assignedUserId?: string
  }
}

export function WorksTimelineDynamic(props: Props) {
  return <WorksTimelineView {...props} />
}
