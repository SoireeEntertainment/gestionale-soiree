export type WorksPageView = 'timeline' | 'list'

export function parseWorksPageView(raw?: string | null): WorksPageView {
  if (raw === 'list') return 'list'
  return 'timeline'
}
