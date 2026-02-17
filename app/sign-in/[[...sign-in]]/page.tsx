import { redirect } from 'next/navigation'
import { getAuthUserId } from '@/lib/auth-dev'
import { SignInForm } from '@/components/auth/sign-in-form'

export default async function SignInPage() {
  const userId = await getAuthUserId()
  if (userId) redirect('/dashboard')

  return <SignInForm />
}
