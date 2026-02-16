import { NavbarWithAuth } from '@/components/layout/navbar-with-auth'

export default function PedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavbarWithAuth />
      {children}
    </>
  )
}
