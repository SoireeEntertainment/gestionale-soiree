export type PedItem = {
  id: string
  date: string
  clientId: string
  kind: string
  type: string
  title: string
  priority?: string
  label?: string | null
  status: string
  description?: string | null
  workId?: string | null
  isExtra?: boolean
  assignedToUserId?: string | null
  assignedTo?: { id: string; name: string } | null
  ownerId?: string
  owner?: { id: string; name: string } | null
  client: { id: string; name: string }
  work?: { id: string; title: string } | null
}

export type WorkDeadlineItem = {
  id: string
  title: string
  description?: string | null
  status: string
  priority?: string | null
  date: string
  deadline: string
  clientId: string
  categoryId: string
  assignedToUserId?: string | null
  assigneeUserIds: string[]
  client: { id: string; name: string }
  category: { id: string; name: string }
}

export type PedDayCellData = {
  dateKey: string
  dayNum: number
  isCurrentMonth: boolean
  items: PedItem[]
  works: WorkDeadlineItem[]
  remainingPct: number
  remainingCount: number
  total: number
  done: number
}
