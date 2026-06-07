'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Client, Category, User } from '@prisma/client'
import { WorkForm } from './work-form'

interface NewWorkModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: Client[]
  categories: Category[]
  users: User[]
}

export function NewWorkModal({ open, onOpenChange, clients, categories, users }: NewWorkModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuovo Lavoro</DialogTitle>
        </DialogHeader>
        <WorkForm
          clients={clients}
          categories={categories}
          users={users}
          onSuccess={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

export function NewWorkButton({ onClick }: { onClick: () => void }) {
  return <Button onClick={onClick}>+ Nuovo Lavoro</Button>
}
