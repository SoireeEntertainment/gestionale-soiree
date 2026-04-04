import { AuthenticatedChrome } from '@/components/layout/authenticated-chrome'

export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthenticatedChrome>{children}</AuthenticatedChrome>
}
