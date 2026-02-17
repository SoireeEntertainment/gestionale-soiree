import { HomeRedirect } from './home-redirect'

export const dynamic = 'force-dynamic'

const clerkConfigured = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
)

export default function Home() {
  return <HomeRedirect clerkConfigured={clerkConfigured} />
}
