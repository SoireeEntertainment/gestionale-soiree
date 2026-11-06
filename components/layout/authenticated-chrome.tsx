import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { AuthTransientError, getCurrentUser } from '@/lib/auth-dev'
import { isDatabaseError } from '@/lib/auth-classification'
import { NavbarWithAuth } from '@/components/layout/navbar-with-auth'
import { AssistantFloatingHost } from '@/components/assistant/assistant-floating-host'
import { isAssistantV2Enabled } from '@/lib/assistant-v2/config'

/**
 * Shell per aree autenticate: navbar + contenuto + assistente flottante (solo se sessione valida).
 * Su mobile aggiunge padding inferiore per la bottom navigation.
 * Un errore temporaneo non svuota la sessione: porta alla pagina di riprova.
 */
export async function AuthenticatedChrome({ children }: { children: React.ReactNode }) {
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null
  try {
    user = await getCurrentUser()
  } catch (err) {
    if (isRedirectError(err)) throw err
    if (err instanceof AuthTransientError || isDatabaseError(err)) redirect('/errore-temporaneo')
    throw err
  }

  const useV2 = isAssistantV2Enabled()

  return (
    <>
      <NavbarWithAuth />
      <div className="pb-[calc(96px+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      {user ? <AssistantFloatingHost useV2={useV2} /> : null}
    </>
  )
}
