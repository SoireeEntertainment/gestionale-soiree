'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Client, Category, User } from '@prisma/client'
import type { WorksBoardData } from '@/app/actions/works-board'
import { WorksFilters, type WorksFiltersState } from './works-filters'
import { NewWorkButton, NewWorkModal } from './new-work-modal'
import { WorksPersonBoard } from './works-person-board'

interface WorksPageClientProps {
  boardData: WorksBoardData
  clients: Client[]
  categories: Category[]
  users: User[]
  filters: WorksFiltersState
  canEdit: boolean
}

export function WorksPageClient({
  boardData,
  clients,
  categories,
  users,
  filters,
  canEdit,
}: WorksPageClientProps) {
  const searchParams = useSearchParams()
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  useEffect(() => {
    if (searchParams.get('nuovo') === '1') setIsCreateOpen(true)
  }, [searchParams])

  const returnTo = (() => {
    const qs = searchParams.toString()
    return qs ? `/works?${qs}` : '/works'
  })()

  return (
    <>
      <div className="flex flex-col gap-4 mb-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <WorksFilters
            clients={clients}
            categories={categories}
            users={users}
            filters={filters}
            hideAssigneeFilter
          />
        </div>
        <div className="shrink-0 md:pt-6">
          <NewWorkButton onClick={() => setIsCreateOpen(true)} />
        </div>
      </div>

      <WorksPersonBoard initialData={boardData} canEdit={canEdit} returnTo={returnTo} />

      <NewWorkModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        clients={clients}
        categories={categories}
        users={users}
      />
    </>
  )
}
