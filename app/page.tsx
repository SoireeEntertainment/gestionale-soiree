import { redirect } from 'next/navigation'
import { getCurrentUser, getAuthUserId } from '@/lib/auth-dev'

export default async function Home() {
  try {
    const userId = await getAuthUserId()
    if (!userId) {
      const isClerkConfigured = !!(
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
        process.env.CLERK_SECRET_KEY
      )
      redirect(isClerkConfigured ? '/sign-in' : '/dev-users')
    }

    const user = await getCurrentUser()
    if (!user) redirect('/dev-users')
    if (user.role === 'AGENTE') redirect('/clients')
    redirect('/dashboard')
  } catch (err) {
    console.error('[Home]', err)
    redirect('/dev-users')
  }
}
