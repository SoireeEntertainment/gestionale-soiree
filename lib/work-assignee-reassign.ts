/**
 * Logica pura per il drag & drop tra colonne persona.
 * Sostituisce fromUserId con toUserId senza eliminare gli altri assegnatari.
 */

export function uniqueUserIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
}

/**
 * Calcola il nuovo insieme di assegnatari dopo uno spostamento A → B.
 * - rimuove fromUserId
 * - aggiunge toUserId se non già presente
 * - non crea duplicati
 */
export function computeReassignedAssigneeIds(input: {
  currentAssigneeIds: string[]
  fromUserId: string
  toUserId: string
}): string[] {
  const { fromUserId, toUserId } = input
  if (!fromUserId || !toUserId) {
    throw new Error('fromUserId e toUserId sono obbligatori')
  }
  if (fromUserId === toUserId) {
    return uniqueUserIds(input.currentAssigneeIds)
  }

  const next = new Set(uniqueUserIds(input.currentAssigneeIds))
  next.delete(fromUserId)
  next.add(toUserId)
  return [...next]
}

/**
 * Assegnatario principale dopo lo spostamento.
 * Se il principale era A, diventa B. Altrimenti resta invariato se ancora presente,
 * altrimenti B (o il primo rimanente).
 */
export function computePrimaryAssigneeId(input: {
  currentPrimaryId: string | null
  fromUserId: string
  toUserId: string
  nextAssigneeIds: string[]
}): string | null {
  const { currentPrimaryId, fromUserId, toUserId, nextAssigneeIds } = input
  if (nextAssigneeIds.length === 0) return null
  if (currentPrimaryId === fromUserId || !currentPrimaryId) return toUserId
  if (nextAssigneeIds.includes(currentPrimaryId)) return currentPrimaryId
  return toUserId
}

/** Utenti da notificare: solo chi non era già assegnato. */
export function newlyAddedAssigneeIds(previousIds: string[], nextIds: string[]): string[] {
  const prev = new Set(uniqueUserIds(previousIds))
  return uniqueUserIds(nextIds).filter((id) => !prev.has(id))
}
