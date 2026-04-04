import { AuthenticatedChrome } from '@/components/layout/authenticated-chrome'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthenticatedChrome>{children}</AuthenticatedChrome>
}
