'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Client, Category, User } from '@prisma/client'
import { WorkForm, type WorkFormPrefill } from './work-form'

interface NewWorkModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: Client[]
  categories: Category[]
  users: User[]
  prefill?: WorkFormPrefill
  title?: string
  onCreated?: (workId: string) => void
  onCancel?: () => void
}

export function NewWorkModal({
  open,
  onOpenChange,
  clients,
  categories,
  users,
  prefill,
  title = 'Nuovo Lavoro',
  onCreated,
  onCancel,
}: NewWorkModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel?.()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-accent/20 bg-dark text-white sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <WorkForm
          key={prefill?.sourceDailyTaskId ?? 'new-work'}
          clients={clients}
          categories={categories}
          users={users}
          clientId={prefill?.clientId}
          prefill={prefill}
          onSuccess={(result) => {
            if (result?.workId) onCreated?.(result.workId)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

export function NewWorkButton({ onClick }: { onClick: () => void }) {
  return <Button onClick={onClick}>+ Nuovo Lavoro</Button>
}
