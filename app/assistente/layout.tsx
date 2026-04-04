import { NavbarWithAuth } from '@/components/layout/navbar-with-auth'

export default function AssistenteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavbarWithAuth />
      {children}
    </>
  )
}
