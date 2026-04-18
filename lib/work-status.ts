export type WorkStatus =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'WAITING_CLIENT'
  | 'DONE'
  | 'PAUSED'
  | 'CANCELED'

type WorkStatusMeta = {
  label: string
  /** Classi Tailwind (devono restare stringhe letterali in questo file per il purge JIT + content ./lib) */
  badgeClassName: string
}

const DEFAULT_META: WorkStatusMeta = {
  label: 'Sconosciuto',
  badgeClassName: 'bg-white/10 text-white/80 border-white/25',
}

/** Normalizza valori DB / alias verso chiave canonica Prisma. */
export function normalizeWorkStatus(raw?: string | null): WorkStatus | null {
  if (raw == null || String(raw).trim() === '') return null
  const key = String(raw)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')

  const alias: Record<string, WorkStatus> = {
    TODO: 'TODO',
    DA_FARE: 'TODO',
    TBD: 'TODO',
    IN_PROGRESS: 'IN_PROGRESS',
    IN_CORSO: 'IN_PROGRESS',
    IN_REVIEW: 'IN_REVIEW',
    IN_REVISIONE: 'IN_REVIEW',
    DONE: 'DONE',
    FATTO: 'DONE',
    COMPLETATO: 'DONE',
    WAITING_CLIENT: 'WAITING_CLIENT',
    ATTESA_CLIENTE: 'WAITING_CLIENT',
    PAUSED: 'PAUSED',
    IN_PAUSA: 'PAUSED',
    CANCELED: 'CANCELED',
    CANCELLED: 'CANCELED',
    ANNULLATO: 'CANCELED',
  }

  if (alias[key]) return alias[key]
  if (key in WORK_STATUS_META) return key as WorkStatus
  return null
}

export const WORK_STATUS_META: Record<WorkStatus, WorkStatusMeta> = {
  TODO: {
    label: 'Da fare',
    badgeClassName: 'bg-red-500/15 text-red-300 border-red-500/40',
  },
  IN_REVIEW: {
    label: 'In revisione',
    badgeClassName: 'bg-amber-600/20 text-amber-300 border-amber-500/40',
  },
  IN_PROGRESS: {
    label: 'In corso',
    badgeClassName: 'bg-yellow-400/15 text-yellow-200 border-yellow-300/35',
  },
  DONE: {
    label: 'Fatto',
    badgeClassName: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  },
  WAITING_CLIENT: {
    label: 'Attesa cliente',
    badgeClassName: 'bg-orange-500/15 text-orange-200 border-orange-400/40',
  },
  PAUSED: {
    label: 'In pausa',
    badgeClassName: 'bg-slate-500/20 text-slate-200 border-slate-400/35',
  },
  CANCELED: {
    label: 'Annullato',
    badgeClassName: 'bg-zinc-600/25 text-zinc-200 border-zinc-400/35',
  },
}

export function getWorkStatusMeta(status?: string | null): WorkStatusMeta {
  if (!status) return DEFAULT_META
  const canonical = normalizeWorkStatus(status)
  if (canonical && WORK_STATUS_META[canonical]) {
    return WORK_STATUS_META[canonical]
  }
  return { ...DEFAULT_META, label: status }
}
