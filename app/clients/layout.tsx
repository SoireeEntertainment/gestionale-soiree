import { NavbarWithAuth } from '@/components/layout/navbar-with-auth'

export default function ClientsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <NavbarWithAuth />
      {children}
    </>
  )
}

