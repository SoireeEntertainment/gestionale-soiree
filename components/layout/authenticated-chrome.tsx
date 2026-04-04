import { getCurrentUser } from '@/lib/auth-dev'
import { NavbarWithAuth } from '@/components/layout/navbar-with-auth'
import { AssistantFloatingHost } from '@/components/assistant/assistant-floating-host'

/**
 * Shell per aree autenticate: navbar + contenuto + assistente flottante (solo se sessione valida).
 */
export async function AuthenticatedChrome({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  return (
    <>
      <NavbarWithAuth />
      {children}
      {user ? <AssistantFloatingHost /> : null}
    </>
  )
}
