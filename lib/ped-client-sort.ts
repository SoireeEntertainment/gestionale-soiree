export type PedClientSort =
  | 'name-asc'
  | 'name-desc'
  | 'contents-asc'
  | 'contents-desc'

export const PED_CLIENT_SORT_OPTIONS: { value: PedClientSort; label: string }[] = [
  { value: 'name-asc', label: 'Nome: A → Z' },
  { value: 'name-desc', label: 'Nome: Z → A' },
  { value: 'contents-asc', label: 'Contenuti/mese: crescente' },
  { value: 'contents-desc', label: 'Contenuti/mese: decrescente' },
]

export const DEFAULT_PED_CLIENT_SORT: PedClientSort = 'name-asc'

export const PED_CLIENT_SORT_STORAGE_KEY = 'ped-client-sort'

export function isPedClientSort(value: unknown): value is PedClientSort {
  return (
    value === 'name-asc' ||
    value === 'name-desc' ||
    value === 'contents-asc' ||
    value === 'contents-desc'
  )
}

type SortablePedClient = {
  contentsPerWeek: number
  client: { name: string }
}

function compareNamesAsc(a: string, b: string): number {
  return a.localeCompare(b, 'it', { sensitivity: 'base' })
}

/** Ordinamento solo visuale dei clienti nel PED. */
export function sortPedClients<T extends SortablePedClient>(
  clients: T[],
  sortMode: PedClientSort
): T[] {
  const sorted = [...clients]
  sorted.sort((a, b) => {
    const nameCmp = compareNamesAsc(a.client.name, b.client.name)
    switch (sortMode) {
      case 'name-desc':
        return -nameCmp || a.contentsPerWeek - b.contentsPerWeek
      case 'contents-asc': {
        const c = a.contentsPerWeek - b.contentsPerWeek
        return c !== 0 ? c : nameCmp
      }
      case 'contents-desc': {
        const c = b.contentsPerWeek - a.contentsPerWeek
        return c !== 0 ? c : nameCmp
      }
      case 'name-asc':
      default:
        return nameCmp || a.contentsPerWeek - b.contentsPerWeek
    }
  })
  return sorted
}
