/** Capacità massima lavori (MVP: valore unico per tutti). */
export const MAX_LAVORI_TOTALI = 40

export type DashboardTaskStats = {
  total: number
  byType: Record<string, number>
  periodLabel: string
}

export type DashboardWorkStats = {
  total: number
  byCategory: { categoryName: string; count: number }[]
  capacity: {
    max: number
    current: number
    saturationPct: number
    isOverloaded: boolean
  }
}
