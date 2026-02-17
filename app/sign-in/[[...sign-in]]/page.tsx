import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getAuthUserId } from '@/lib/auth-dev'
import { SignInForm } from '@/components/auth/sign-in-form'

export default async function SignInPage() {
  await connection()
  const userId = await getAuthUserId()
  if (userId) redirect('/dashboard')

  return <SignInForm />
}
