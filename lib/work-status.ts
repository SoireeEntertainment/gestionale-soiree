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
  badgeClassName: string
}

const DEFAULT_META: WorkStatusMeta = {
  label: 'Sconosciuto',
  badgeClassName: 'bg-white/10 text-white/80 border-white/20',
}

export const WORK_STATUS_META: Record<WorkStatus, WorkStatusMeta> = {
  TODO: {
    label: 'Da fare',
    badgeClassName: 'bg-red-500/20 text-red-200 border-red-400/35',
  },
  IN_REVIEW: {
    label: 'In revisione',
    badgeClassName: 'bg-amber-700/30 text-amber-100 border-amber-500/35',
  },
  IN_PROGRESS: {
    label: 'In corso',
    badgeClassName: 'bg-yellow-400/20 text-yellow-100 border-yellow-300/30',
  },
  DONE: {
    label: 'Fatto',
    badgeClassName: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35',
  },
  WAITING_CLIENT: {
    label: 'Attesa cliente',
    badgeClassName: 'bg-orange-500/20 text-orange-200 border-orange-400/35',
  },
  PAUSED: {
    label: 'In pausa',
    badgeClassName: 'bg-slate-500/25 text-slate-200 border-slate-300/30',
  },
  CANCELED: {
    label: 'Annullato',
    badgeClassName: 'bg-zinc-600/30 text-zinc-200 border-zinc-400/30',
  },
}

export function getWorkStatusMeta(status?: string | null): WorkStatusMeta {
  if (!status) return DEFAULT_META
  return WORK_STATUS_META[status as WorkStatus] ?? { ...DEFAULT_META, label: status }
}
