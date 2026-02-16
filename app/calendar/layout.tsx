import { NavbarWithAuth } from '@/components/layout/navbar-with-auth'

export default function CalendarLayout({
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

