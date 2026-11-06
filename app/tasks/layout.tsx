import { AuthenticatedChrome } from '@/components/layout/authenticated-chrome'

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthenticatedChrome>{children}</AuthenticatedChrome>
}
