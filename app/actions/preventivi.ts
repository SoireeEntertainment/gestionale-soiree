'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, canWrite } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { preventivoSchema } from '@/lib/validations'
import path from 'path'
import fs from 'fs/promises'

export async function createPreventivo(data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const parsed = preventivoSchema.parse(data) as {
    clientId: string
    title: string
    type: 'GENERATED' | 'UPLOADED'
    status?: string
    totalAmount?: number | null
    notes?: string
    items?: { description: string; quantity: number; unitPrice: number; order?: number }[]
  }
  const { items = [], clientId, title, type, status, totalAmount, notes } = parsed

  const preventivo = await prisma.preventivo.create({
    data: {
      clientId,
      title,
      type,
      status: status || 'BOZZA',
      totalAmount: totalAmount ?? undefined,
      notes: notes ?? undefined,
    },
  })

  if (items.length > 0) {
    await prisma.preventivoItem.createMany({
      data: items.map((item, i) => ({
        preventivoId: preventivo.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        order: item.order ?? i,
      })),
    })
  }

  revalidatePath('/preventivi')
  revalidatePath(`/clients/${preventivo.clientId}`)
  return { success: true, preventivo }
}

export async function updatePreventivo(id: string, data: unknown) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const parsed = preventivoSchema.partial().parse(data) as {
    title?: string
    status?: string
    totalAmount?: number | null
    notes?: string
    items?: { description: string; quantity: number; unitPrice: number; order?: number }[]
  }

  const { items, ...rest } = parsed

  const preventivo = await prisma.preventivo.update({
    where: { id },
    data: rest,
  })

  if (items !== undefined) {
    await prisma.preventivoItem.deleteMany({ where: { preventivoId: id } })
    if (items.length > 0) {
      await prisma.preventivoItem.createMany({
        data: items.map((item, i) => ({
          preventivoId: id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          order: item.order ?? i,
        })),
      })
    }
  }

  revalidatePath('/preventivi')
  revalidatePath(`/preventivi/${id}`)
  revalidatePath(`/clients/${preventivo.clientId}`)
  return { success: true, preventivo }
}

export async function deletePreventivo(id: string) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const prev = await prisma.preventivo.findUnique({ where: { id } })
  if (!prev) throw new Error('Preventivo non trovato')

  if (prev.filePath) {
    try {
      const fullPath = path.join(process.cwd(), prev.filePath)
      await fs.unlink(fullPath)
    } catch {
      // ignore if file missing
    }
  }

  await prisma.preventivo.delete({ where: { id } })
  revalidatePath('/preventivi')
  revalidatePath(`/clients/${prev.clientId}`)
  return { success: true }
}

export async function getPreventivo(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  return prisma.preventivo.findUnique({
    where: { id },
    include: {
      client: true,
      items: { orderBy: { order: 'asc' } },
    },
  })
}

export async function getPreventivi() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  return prisma.preventivo.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      client: true,
      items: { orderBy: { order: 'asc' } },
    },
  })
}

export async function getPreventiviByClient(clientId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  return prisma.preventivo.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { orderBy: { order: 'asc' } },
    },
  })
}

const UPLOAD_DIR = 'uploads/preventivi'
const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF

function isPdfBuffer(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false
  const view = new Uint8Array(buf)
  return PDF_MAGIC.every((b, i) => view[i] === b)
}

export async function createPreventivoWithUpload(
  clientId: string,
  title: string,
  formData: FormData
) {
  const user = await getCurrentUser()
  if (!user || !canWrite(user)) throw new Error('Non autorizzato')

  const file = formData.get('pdf') as File | null
  if (!file || file.size === 0) throw new Error('Seleziona un file PDF')
  if (file.size > MAX_PDF_SIZE_BYTES) {
    throw new Error(`File troppo grande (max ${MAX_PDF_SIZE_BYTES / 1024 / 1024} MB)`)
  }

  const bytes = await file.arrayBuffer()
  if (!isPdfBuffer(bytes)) {
    throw new Error('Il file non è un PDF valido')
  }

  const preventivo = await prisma.preventivo.create({
    data: {
      clientId,
      title: title || file.name.replace(/\.pdf$/i, '') || 'Preventivo caricato',
      type: 'UPLOADED',
      status: 'BOZZA',
      filePath: null,
    },
  })

  const dir = path.join(process.cwd(), UPLOAD_DIR, clientId)
  await fs.mkdir(dir, { recursive: true })
  const ext = path.extname(file.name) || '.pdf'
  const safeName = `${preventivo.id}${ext}`
  const filePath = path.join(dir, safeName)
  await fs.writeFile(filePath, Buffer.from(bytes))

  const relativePath = path.join(UPLOAD_DIR, clientId, safeName)
  await prisma.preventivo.update({
    where: { id: preventivo.id },
    data: { filePath: relativePath },
  })

  revalidatePath('/preventivi')
  revalidatePath(`/clients/${clientId}`)
  return { success: true, preventivo: { ...preventivo, filePath: relativePath } }
}
