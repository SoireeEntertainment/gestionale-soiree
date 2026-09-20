/** Tipi condivisi client/server per Shooting e Reel (niente `"use server"`). */

export type ShootingReelRow = {
  id: string
  shootingId: string
  topic: string
  published: boolean
  publishedAt: Date | null
  pedTaskId: string | null
  pedTaskDate: string | null
}

export type ClientShootingRow = {
  id: string
  clientId: string
  date: Date
  name: string
  location: string | null
  notes: string | null
  reels: ShootingReelRow[]
  totalReels: number
  publishedReels: number
}

/** Payload leggero per select nel form task PED (caricato on-demand). */
export type PedShootingOption = {
  id: string
  date: string
  name: string
  location: string | null
  reels: {
    id: string
    topic: string
    published: boolean
    linkedPedItemId: string | null
  }[]
}

export type PedShootingReelSummary = {
  id: string
  topic: string
  published: boolean
  shooting: {
    id: string
    name: string
    date: string
    location: string | null
  }
}
