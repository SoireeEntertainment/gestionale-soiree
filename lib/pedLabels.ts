/**
 * Etichette PED unificate: 4 stati con colori fissi.
 * Sostituisce il vecchio sistema priority (Urgente/Media/Non urgente).
 * "Fatto" è sempre coerente con status DONE.
 */

export const PED_LABELS = [
  'IN_APPROVAZIONE',
  'DA_FARE',
  'PRONTO_NON_PUBBLICATO',
  'FATTO',
] as const

export type PedLabel = (typeof PED_LABELS)[number]

export const PED_LABEL_CONFIG: Record<
  PedLabel,
  { label: string; backgroundColor: string; color: string; bg: string; text: string }
> = {
  IN_APPROVAZIONE: {
    label: 'In approvazione',
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    color: '#ffffff',
    bg: 'bg-red-600/75',
    text: 'text-white',
  },
  DA_FARE: {
    label: 'Da fare',
    backgroundColor: 'rgba(234, 179, 8, 0.95)',
    color: '#1f2937',
    bg: 'bg-amber-500/85',
    text: 'text-gray-900',
  },
  PRONTO_NON_PUBBLICATO: {
    label: 'Pronto ma non pubblicato',
    backgroundColor: 'rgba(37, 99, 235, 0.9)',
    color: '#ffffff',
    bg: 'bg-blue-600/75',
    text: 'text-white',
  },
  FATTO: {
    label: 'Fatto',
    backgroundColor: 'rgba(5, 150, 105, 0.9)',
    color: '#ffffff',
    bg: 'bg-emerald-600/75',
    text: 'text-white',
  },
}

/** Ordine per raggruppamento nel calendario (Fatto in fondo). */
export const PED_LABEL_ORDER: Record<PedLabel, number> = {
  IN_APPROVAZIONE: 0,
  DA_FARE: 1,
  PRONTO_NON_PUBBLICATO: 2,
  FATTO: 3,
}

export const DEFAULT_LABEL: PedLabel = 'DA_FARE'
export const DONE_LABEL: PedLabel = 'FATTO'

/** Ritorna true se l'etichetta corrisponde a task completata. */
export function isDoneLabel(label: string | null | undefined): boolean {
  return label === DONE_LABEL
}

/**
 * Etichetta effettiva per un item: usa label se valorizzata, altrimenti mappa da priority/status (retrocompat).
 */
export function getEffectiveLabel(item: {
  label?: string | null
  priority?: string | null
  status?: string | null
}): PedLabel {
  const l = item.label?.trim()
  if (l && PED_LABELS.includes(l as PedLabel)) return l as PedLabel
  if (item.status === 'DONE') return DONE_LABEL
  // Retrocompat: vecchie priority
  const p = item.priority?.trim()
  if (p === 'URGENT') return 'IN_APPROVAZIONE'
  if (p === 'NOT_URGENT') return 'PRONTO_NON_PUBBLICATO'
  return DEFAULT_LABEL
}

/** Stile (colori) per l'etichetta; fallback DA_FARE se invalida. */
export function getLabelStyle(label: string | null | undefined) {
  const l = (label ?? '').trim()
  if (l && PED_LABELS.includes(l as PedLabel)) return PED_LABEL_CONFIG[l as PedLabel]
  return PED_LABEL_CONFIG[DEFAULT_LABEL]
}

/** Per uso in UI: dato un item con eventuale priority/status legacy, ritorna config. */
export function getItemLabelStyle(item: {
  label?: string | null
  priority?: string | null
  status?: string | null
}) {
  const effective = getEffectiveLabel(item)
  return PED_LABEL_CONFIG[effective]
}
