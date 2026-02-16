import { getCurrentUser } from '@/lib/auth-dev'
import { Navbar } from './navbar'

const isClerkConfigured = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
)

export async function NavbarWithAuth() {
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null
  try {
    user = await getCurrentUser()
  } catch (err) {
    console.error('[NavbarWithAuth]', err)
  }
  return (
    <Navbar
      role={user?.role ?? null}
      showDevSwitcher={!isClerkConfigured}
      currentUserName={user?.name ?? null}
    />
  )
}
