/** Template checklist operativa per categoria lavoro (max 6 step). */
export const WORK_STEP_TEMPLATES: Record<string, readonly string[]> = {
  Website: [
    'Preventivo accettato',
    'Acquisizione e intestazione dominio',
    'Installazione WordPress e plugin di base',
    'Creazione pagine, testi e immagini',
    'Configurazione plugin e integrazioni',
    'SEO base e messa online',
  ],
  Social: [
    'Raccolta informazioni e obiettivi cliente',
    'Definizione piano editoriale',
    'Creazione testi e grafiche/contenuti',
    'Revisione interna',
    'Invio al cliente per approvazione',
    'Programmazione e pubblicazione',
  ],
  ADV: [
    'Brief obiettivi e target',
    'Definizione budget e strategia',
    'Creazione creatività e copy',
    'Setup campagna e tracciamenti',
    'Controllo performance',
    'Report e ottimizzazione',
  ],
  'Foto/Video': [
    'Brief contenuti e mood',
    'Pianificazione shooting',
    'Riprese foto/video',
    'Selezione materiale',
    'Montaggio/post-produzione',
    'Consegna finale al cliente',
  ],
  Grafica: [
    'Raccolta brief e materiali',
    'Definizione stile grafico',
    'Prima bozza creativa',
    'Revisione interna',
    'Modifiche e approvazione cliente',
    'Esportazione e consegna file',
  ],
} as const

const CATEGORY_ALIASES: Record<string, keyof typeof WORK_STEP_TEMPLATES> = {
  website: 'Website',
  'sito web': 'Website',
  sito: 'Website',
  social: 'Social',
  adv: 'ADV',
  'foto/video': 'Foto/Video',
  foto: 'Foto/Video',
  video: 'Foto/Video',
  grafica: 'Grafica',
}

export function resolveWorkStepTemplateKey(categoryName: string): keyof typeof WORK_STEP_TEMPLATES | null {
  const trimmed = categoryName.trim()
  if (!trimmed) return null

  if (trimmed in WORK_STEP_TEMPLATES) {
    return trimmed as keyof typeof WORK_STEP_TEMPLATES
  }

  const lower = trimmed.toLowerCase()
  if (lower in CATEGORY_ALIASES) {
    return CATEGORY_ALIASES[lower]
  }

  for (const [key, titles] of Object.entries(WORK_STEP_TEMPLATES)) {
    if (key.toLowerCase() === lower) return key as keyof typeof WORK_STEP_TEMPLATES
  }

  return null
}

export function getDefaultStepTitlesForCategory(categoryName: string): string[] {
  const key = resolveWorkStepTemplateKey(categoryName)
  if (!key) return []
  return [...WORK_STEP_TEMPLATES[key]]
}
