import { NavbarWithAuth } from '@/components/layout/navbar-with-auth'

export default function PreventiviLayout({
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
