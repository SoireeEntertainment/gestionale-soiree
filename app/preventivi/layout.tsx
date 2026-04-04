import { AuthenticatedChrome } from '@/components/layout/authenticated-chrome'

export default function PreventiviLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthenticatedChrome>{children}</AuthenticatedChrome>
}
