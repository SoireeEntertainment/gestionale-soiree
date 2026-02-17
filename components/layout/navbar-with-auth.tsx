import { getCurrentUser, type UserRole } from '@/lib/auth-dev'
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
  const role = user?.role != null ? (String(user.role) as UserRole) : null
  const currentUserName = user?.name != null ? String(user.name) : null
  return (
    <Navbar
      role={role}
      showDevSwitcher={!isClerkConfigured}
      currentUserName={currentUserName}
    />
  )
}
