import { NavbarWithAuth } from '@/components/layout/navbar-with-auth'

export default function WorksLayout({
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

