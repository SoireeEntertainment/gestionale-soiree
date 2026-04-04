import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const threads = await prisma.chatThread.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  })
  return NextResponse.json({ threads })
}

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const t = await prisma.chatThread.create({
    data: { userId: user.id, title: 'Nuova chat' },
  })
  return NextResponse.json({ thread: t })
}
