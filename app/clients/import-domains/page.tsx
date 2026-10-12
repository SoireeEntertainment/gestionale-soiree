import { requireAuth } from '@/lib/auth-dev'
import { DomainImportForm } from '@/components/clients/domain-import-form'

export default async function ImportDomainsPage() {
  await requireAuth()

  return (
    <div className="min-h-screen bg-dark p-4 md:p-6">
      <div className="w-full px-4 md:w-[90vw] md:max-w-[90vw] md:px-6 mx-auto">
        <DomainImportForm />
      </div>
    </div>
  )
}
