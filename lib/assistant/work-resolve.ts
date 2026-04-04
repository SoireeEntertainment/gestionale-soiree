import { prisma } from '@/lib/prisma'
import type { AssistantThreadContext } from '@/lib/assistant/thread-context'
import {
  resolveSingleClient,
  findWorksByClientCategoryOrTitle,
  resolveUserByNameHint,
} from '@/lib/assistant/resolve-entities'

export function parseItalianoNameList(raw: string): string[] {
  const s = raw.trim()
  if (!s) return []
  return s
    .split(/\s+e\s+|,|;/i)
    .map((x) => x.trim())
    .filter(Boolean)
}

export async function resolveUserIdsFromLabelList(label: string): Promise<
  { ok: true; ids: string[] } | { ok: false; reply: string }
> {
  const parts = parseItalianoNameList(label)
  if (parts.length === 0) return { ok: false, reply: 'Indica almeno un nome utente.' }
  const ids: string[] = []
  for (const p of parts) {
    const u = await resolveUserByNameHint(p)
    if (!u) return { ok: false, reply: `Non ho trovato un utente simile a "${p}".` }
    if ('ambiguous' in u) {
      return {
        ok: false,
        reply: `Più utenti per "${p}": ${u.ambiguous.map((x) => x.name).join(', ')}. Specifica meglio.`,
      }
    }
    ids.push(u.id)
  }
  return { ok: true, ids: [...new Set(ids)] }
}

export type ResolvedWorkFull = {
  id: string
  title: string
  clientId: string
  client: { name: string }
  category: { id: string; name: string }
}

/**
 * Risolve un lavoro univoco da parametri LLM / regole + contesto thread.
 */
export async function resolveWorkFromAssistantParams(
  params: Record<string, unknown>,
  threadCtx: AssistantThreadContext | null,
  opts?: { implicitLastWork?: boolean }
): Promise<{ ok: true; work: ResolvedWorkFull } | { ok: false; reply: string }> {
  const str = (k: string) => (typeof params[k] === 'string' ? (params[k] as string).trim() : '')

  const workId = str('workId')
  if (workId) {
    const w = await prisma.work.findUnique({
      where: { id: workId },
      include: { client: { select: { name: true } }, category: { select: { id: true, name: true } } },
    })
    if (!w) return { ok: false, reply: 'Lavoro non trovato per id indicato.' }
    return {
      ok: true,
      work: {
        id: w.id,
        title: w.title,
        clientId: w.clientId,
        client: { name: w.client.name },
        category: w.category,
      },
    }
  }

  let clientHint = str('clientName') || str('client')
  let workHint = str('workTitleHint') || str('workTitle') || str('categoryName') || str('category')

  const last = threadCtx?.lastWork
  if (opts?.implicitLastWork && last && !workId) {
    if (!clientHint && !workHint) {
      const w = await prisma.work.findUnique({
        where: { id: last.id },
        include: { client: { select: { name: true } }, category: { select: { id: true, name: true } } },
      })
      if (w) {
        return {
          ok: true,
          work: {
            id: w.id,
            title: w.title,
            clientId: w.clientId,
            client: { name: w.client.name },
            category: w.category,
          },
        }
      }
    }
    if (!clientHint && last.clientName) clientHint = last.clientName
    if (!workHint && last.title) workHint = last.title
  }

  if (!clientHint && threadCtx?.lastClient?.name) {
    clientHint = threadCtx.lastClient.name
  }

  if (!clientHint || !workHint) {
    return {
      ok: false,
      reply:
        'Per identificare il lavoro servono cliente e riferimento (titolo o categoria), oppure il workId. Puoi anche continuare subito dopo aver creato o citato un lavoro in questa chat.',
    }
  }

  const cr = await resolveSingleClient(clientHint)
  if (!cr || 'ambiguous' in cr) {
    return {
      ok: false,
      reply: cr && 'ambiguous' in cr
        ? `Più clienti per "${clientHint}": ${cr.ambiguous.map((c) => c.name).join(', ')}.`
        : `Cliente non trovato per "${clientHint}".`,
    }
  }

  const works = await findWorksByClientCategoryOrTitle(cr.id, workHint)
  if (works.length === 0) {
    return { ok: false, reply: `Nessun lavoro corrispondente a "${workHint}" per ${cr.name}.` }
  }
  if (works.length > 1) {
    return {
      ok: false,
      reply: `Ho trovato ${works.length} lavori compatibili (${works.map((w) => w.title).join(', ')}). Quale intendi? Specifica meglio il titolo.`,
    }
  }

  const w = await prisma.work.findUnique({
    where: { id: works[0].id },
    include: { client: { select: { name: true } }, category: { select: { id: true, name: true } } },
  })
  if (!w) return { ok: false, reply: 'Lavoro non trovato.' }

  return {
    ok: true,
    work: {
      id: w.id,
      title: w.title,
      clientId: w.clientId,
      client: { name: w.client.name },
      category: w.category,
    },
  }
}

export async function resolveStepOnWork(
  workId: string,
  stepHint: string
): Promise<
  { ok: true; step: { id: string; title: string } } | { ok: false; reply: string }
> {
  const q = stepHint.trim()
  if (!q) return { ok: false, reply: 'Indica il titolo dello step.' }
  const steps = await prisma.workStep.findMany({
    where: { workId, title: { contains: q, mode: 'insensitive' } },
    orderBy: { sortOrder: 'asc' },
  })
  if (steps.length === 0) return { ok: false, reply: `Nessuno step trovato per "${q}".` }
  if (steps.length > 1) {
    return {
      ok: false,
      reply: `Più step compatibili: ${steps.map((s) => s.title).join(', ')}. Sii più specifico.`,
    }
  }
  return { ok: true, step: { id: steps[0].id, title: steps[0].title } }
}
