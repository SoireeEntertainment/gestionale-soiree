/**
 * Smoke test rule-based parsing (no DB). Run: npx tsx scripts/assistant-parse-smoke.ts
 */
import { parseRuleBasedIntent } from '../lib/assistant/intent-parser'
import { tryParseFollowUpRule } from '../lib/assistant/follow-up-parser'
import { ASSISTANT_CONTEXT_VERSION, type AssistantThreadContext } from '../lib/assistant/thread-context'

function fail(msg: string): never {
  console.error(msg)
  process.exit(1)
}

const baseCtx: AssistantThreadContext = {
  version: ASSISTANT_CONTEXT_VERSION,
  lastUndo: null,
  lastWork: {
    id: 'w-test',
    title: 'Website',
    clientId: 'c-test',
    clientName: 'Rinlux',
  },
}

let r = parseRuleBasedIntent('Crea un lavoro Website per Rinlux')
if (!r || r.kind !== 'create_work' || r.clientName !== 'Rinlux') fail('create_work base')

r = parseRuleBasedIntent('Crea un lavoro Social per Oneforall assegnato a Davide e Cristian')
if (!r || r.kind !== 'create_work' || !r.assigneeNames?.includes('Davide')) fail('create_work assignees')

r = parseRuleBasedIntent('Aggiungi lo step Revisione al lavoro Website di Rinlux')
if (!r || r.kind !== 'create_work_step' || r.stepTitle !== 'Revisione') fail('create_work_step')

r = parseRuleBasedIntent('Sposta la deadline del lavoro Website di Rinlux al 20 marzo')
if (!r || r.kind !== 'update_work' || !r.deadlineRaw?.includes('20')) fail('update_work deadline')

r = parseRuleBasedIntent('Segna come completato lo step Wireframe del lavoro Website di Rinlux')
if (!r || r.kind !== 'mark_work_step_done' || r.stepTitle !== 'Wireframe') fail('mark_work_step_done')

r = tryParseFollowUpRule('assegnalo a Davide e Cristian', baseCtx)
if (!r || r.kind !== 'assign_work_users_rule' || r.workId !== 'w-test') fail('follow-up assign')

r = tryParseFollowUpRule('aggiungi lo step QA', baseCtx)
if (!r || r.kind !== 'create_work_step_followup' || r.stepTitle !== 'QA') fail('follow-up step')

r = tryParseFollowUpRule('metti la deadline al 15 aprile', baseCtx)
if (!r || r.kind !== 'update_work' || !r.deadlineRaw?.includes('15')) fail('follow-up deadline')

console.log('assistant-parse-smoke: ok')
