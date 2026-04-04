import { AuthenticatedChrome } from '@/components/layout/authenticated-chrome'

export default function ProfiloLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthenticatedChrome>{children}</AuthenticatedChrome>
}
