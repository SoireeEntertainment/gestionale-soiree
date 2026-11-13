import { AsyncLocalStorage } from 'node:async_hooks'
import type { CurrentUser } from '@/lib/auth-dev'

/**
 * Attore autenticato server-side per canali senza cookie Clerk (es. Telegram).
 * Non simula sessioni Clerk: viene impostato solo dopo risoluzione verificata
 * (TelegramConnection → User attivo).
 */
const actorStorage = new AsyncLocalStorage<CurrentUser>()

export function getRequestActor(): CurrentUser | null {
  return actorStorage.getStore() ?? null
}

export function runWithRequestActor<T>(actor: CurrentUser, fn: () => T): T {
  return actorStorage.run(actor, fn)
}

export async function runWithRequestActorAsync<T>(
  actor: CurrentUser,
  fn: () => Promise<T>
): Promise<T> {
  return actorStorage.run(actor, fn)
}
