'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Category, Client, ClientCategory, Work } from '@prisma/client'
import { CategoryForm } from './category-form'
import { CategoryClientsTab } from './category-clients-tab'
import { CategoryWorksTab } from './category-works-tab'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface CategoryDetailProps {
  category: Category & {
    clientCategories: (ClientCategory & { client: Client })[]
    works: (Work & { client: Client })[]
  }
  allClients: Client[]
}

export function CategoryDetail({ category, allClients }: CategoryDetailProps) {
  const [activeTab, setActiveTab] = useState<'clients' | 'works'>('clients')
  const [isEditOpen, setIsEditOpen] = useState(false)

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/categories" className="text-accent hover:underline mb-2 inline-block">
              ← Torna alle categorie
            </Link>
            <h1 className="text-3xl font-bold text-white">{category.name}</h1>
          </div>
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogTrigger asChild>
              <Button>Modifica Categoria</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Modifica Categoria</DialogTitle>
              </DialogHeader>
              <CategoryForm
                category={category}
                onSuccess={() => setIsEditOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        {category.description && (
          <div className="bg-dark border border-accent/20 rounded-lg p-6 mb-6">
            <div className="text-white/70">{category.description}</div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-accent/20 mb-6">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('clients')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'clients'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Clienti ({category.clientCategories.length})
            </button>
            <button
              onClick={() => setActiveTab('works')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'works'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Lavori ({category.works.length})
            </button>
          </div>
        </div>

        {activeTab === 'clients' && (
          <CategoryClientsTab
            categoryId={category.id}
            clientCategories={category.clientCategories}
            allClients={allClients}
          />
        )}

        {activeTab === 'works' && (
          <CategoryWorksTab categoryId={category.id} works={category.works} />
        )}
      </div>
    </div>
  )
}

