import { AuthenticatedChrome } from '@/components/layout/authenticated-chrome'

export default function WorksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthenticatedChrome>{children}</AuthenticatedChrome>
}
