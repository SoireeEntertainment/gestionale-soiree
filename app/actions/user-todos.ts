'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'

export async function getMyTodos(userId: string) {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) throw new Error('Non autorizzato')

  try {
    return await prisma.userTodo.findMany({
      where: { userId },
      orderBy: [{ completed: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
  } catch {
    return []
  }
}

export async function createTodo(userId: string, title: string) {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) throw new Error('Non autorizzato')

  const maxOrder = await prisma.userTodo.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  })

  await prisma.userTodo.create({
    data: {
      userId,
      title: title.trim(),
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })

  revalidatePath('/profilo')
}

export async function toggleTodo(todoId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const todo = await prisma.userTodo.findUnique({
    where: { id: todoId },
    select: { userId: true, completed: true },
  })
  if (!todo || todo.userId !== user.id) throw new Error('Non autorizzato')

  await prisma.userTodo.update({
    where: { id: todoId },
    data: { completed: !todo.completed },
  })

  revalidatePath('/profilo')
}

export async function deleteTodo(todoId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const todo = await prisma.userTodo.findUnique({
    where: { id: todoId },
    select: { userId: true },
  })
  if (!todo || todo.userId !== user.id) throw new Error('Non autorizzato')

  await prisma.userTodo.delete({ where: { id: todoId } })

  revalidatePath('/profilo')
}
