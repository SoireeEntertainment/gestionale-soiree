import { prisma } from '@/lib/prisma'
import { DONE_LABEL, getEffectiveLabel } from '@/lib/pedLabels'

/**
 * Quando una task PED collegata a uno ShootingReel diventa "Fatto",
 * marca il Reel come pubblicato (senza sovrascrivere publishedAt esistente).
 * Unidirezionale: tornare a Da fare NON annulla la pubblicazione.
 */
export async function syncLinkedShootingReelAfterPedStatusChange(params: {
  pedItemId: string
  newStatus?: string | null
  newLabel?: string | null
}): Promise<void> {
  const item = await prisma.pedItem.findUnique({
    where: { id: params.pedItemId },
    select: {
      shootingReelId: true,
      status: true,
      label: true,
    },
  })
  if (!item?.shootingReelId) return

  const effective = getEffectiveLabel({
    label: params.newLabel ?? item.label,
    status: params.newStatus ?? item.status,
  })
  if (effective !== DONE_LABEL) return

  await markShootingReelPublishedIfNeeded(item.shootingReelId)
}

/** Marca un Reel pubblicato se non lo è già; non sovrascrive publishedAt. */
export async function markShootingReelPublishedIfNeeded(reelId: string): Promise<void> {
  const reel = await prisma.shootingReel.findUnique({
    where: { id: reelId },
    select: { id: true, published: true, publishedAt: true },
  })
  if (!reel) return
  if (reel.published && reel.publishedAt) return

  await prisma.shootingReel.update({
    where: { id: reelId },
    data: {
      published: true,
      publishedAt: reel.publishedAt ?? new Date(),
    },
  })
}

/**
 * Valida e risolve shootingReelId per una task PED.
 * - solo tipologia REEL
 * - reel appartenente al cliente
 * - non già collegato ad altra task (salvo currentPedItemId)
 */
export async function resolveShootingReelForPedItem(params: {
  clientId: string
  type: string
  shootingReelId: string | null | undefined
  currentPedItemId?: string
}): Promise<string | null> {
  if (params.type !== 'REEL') return null
  if (!params.shootingReelId) return null

  const reel = await prisma.shootingReel.findUnique({
    where: { id: params.shootingReelId },
    select: {
      id: true,
      shooting: { select: { clientId: true } },
      pedTasks: { select: { id: true }, take: 5 },
    },
  })
  if (!reel) throw new Error('Argomento Reel non trovato')
  if (reel.shooting.clientId !== params.clientId) {
    throw new Error('Lo shooting selezionato non appartiene al cliente della task')
  }

  const linkedElsewhere = reel.pedTasks.some((t) => t.id !== params.currentPedItemId)
  if (linkedElsewhere) {
    throw new Error('Questo argomento Reel è già collegato a un’altra task PED')
  }

  return reel.id
}
