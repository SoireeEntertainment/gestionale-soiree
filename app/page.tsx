import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { classifyProviderSession, readAuthReason } from '@/lib/auth-classification'
import { HomeRedirect } from './home-redirect'

export const dynamic = 'force-dynamic'

const clerkConfigured = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
)

/**
 * Home: decisione di redirect lato server quando Clerk è configurato.
 * Evita race client (isLoaded / handshake) che possono concorrere con
 * middleware.protect e consumare due volte il refresh token.
 */
export default async function Home() {
  if (!clerkConfigured) {
    return <HomeRedirect clerkConfigured={false} />
  }

  try {
    const session = await auth()
    const decision = classifyProviderSession({
      userId: session.userId ?? null,
      reason: session.userId ? null : readAuthReason(session),
      thrown: false,
      recoveryAttempted: false,
    })
    if (decision.kind === 'authenticated') redirect('/dashboard')
    // Su / il documento ha già potuto fare handshake nel middleware.
    // Un recupero ulteriore verso una route protetta può consumare di nuovo il token.
    if (decision.kind === 'temporary') redirect('/errore-temporaneo')
    redirect('/sign-in')
  } catch (error) {
    if (isRedirectError(error)) throw error
    redirect('/errore-temporaneo')
  }
}
