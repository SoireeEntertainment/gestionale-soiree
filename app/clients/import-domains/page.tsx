import { requireAuth } from '@/lib/auth-dev'
import { DomainImportForm } from '@/components/clients/domain-import-form'

export default async function ImportDomainsPage() {
  await requireAuth()

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <DomainImportForm />
      </div>
    </div>
  )
}
