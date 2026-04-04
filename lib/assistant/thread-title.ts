import type { RuleBasedIntent } from '@/lib/assistant/intent-parser'

function titleCase(s: string) {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** Titolo sintetico per sidebar (max ~42 caratteri). */
export function suggestThreadTitleFromRule(rule: RuleBasedIntent | null, fallbackMessage: string): string {
  if (rule) {
    switch (rule.kind) {
      case 'add_client_credential':
        return titleCase(`Credenziali ${rule.label} · ${rule.clientName}`.slice(0, 42))
      case 'create_work':
        return titleCase(`Lavoro ${rule.categoryName} · ${rule.clientName}`.slice(0, 42))
      case 'create_work_step':
        return titleCase(`Step ${rule.stepTitle} · ${rule.clientName}`.slice(0, 42))
      case 'update_work':
        return titleCase(`Deadline ${rule.workHint} · ${rule.clientName}`.slice(0, 42))
      case 'mark_work_step_done':
        return titleCase(`Step ✓ ${rule.stepTitle} · ${rule.clientName}`.slice(0, 42))
      case 'assign_work_users_rule':
        return 'Assegnazione lavoro'
      case 'create_work_step_followup':
        return titleCase(`Step ${rule.stepTitle}`.slice(0, 42))
      case 'query_active_works':
        return `Lavori attivi · ${rule.userName}`.slice(0, 42)
      case 'query_renewals':
        return `Rinnovi · ${rule.days}gg`.slice(0, 42)
      case 'query_client_credentials':
        return titleCase(`Cred. ${rule.labelHint} · ${rule.clientName}`.slice(0, 42))
      case 'undo_last_action':
        return 'Annulla ultima azione'
      case 'query_ped_month_remaining':
        return titleCase(`Task mese · ${rule.clientName}`.slice(0, 42))
      case 'query_top_clients_active_works':
        return 'Top clienti · lavori attivi'
      case 'query_my_ped_today':
        return 'Le mie task oggi'
      case 'query_clients_active_category_work':
        return titleCase(`Clienti · ${rule.categoryHint}`.slice(0, 42))
      default:
        break
    }
  }
  const t = fallbackMessage.replace(/\s+/g, ' ').trim()
  if (!t) return 'Chat assistente'
  const short = t.slice(0, 42) + (t.length > 42 ? '…' : '')
  return titleCase(short)
}
