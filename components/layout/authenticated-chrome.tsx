import { getCurrentUser } from '@/lib/auth-dev'
import { NavbarWithAuth } from '@/components/layout/navbar-with-auth'
import { AssistantFloatingHost } from '@/components/assistant/assistant-floating-host'

/**
 * Shell per aree autenticate: navbar + contenuto + assistente flottante (solo se sessione valida).
 * Su mobile aggiunge padding inferiore per la bottom navigation.
 */
export async function AuthenticatedChrome({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  return (
    <>
      <NavbarWithAuth />
      <div className="pb-[calc(96px+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      {user ? <AssistantFloatingHost /> : null}
    </>
  )
}
