import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
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

  const { userId } = await auth()
  if (userId) {
    redirect('/dashboard')
  }
  redirect('/sign-in')
}
