import { NavbarWithAuth } from '@/components/layout/navbar-with-auth'

export default function DashboardLayout({
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

