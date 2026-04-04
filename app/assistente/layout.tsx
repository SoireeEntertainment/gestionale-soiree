import { AuthenticatedChrome } from '@/components/layout/authenticated-chrome'

export default function AssistenteLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedChrome>{children}</AuthenticatedChrome>
}
