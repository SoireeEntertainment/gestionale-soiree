import { AuthenticatedChrome } from '@/components/layout/authenticated-chrome'

export default function PedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthenticatedChrome>{children}</AuthenticatedChrome>
}
