# Assistente Soirëe V2

## Architettura

Motore basato su **Vercel AI SDK** (`ai@4.3` + `@ai-sdk/openai`) con **tool calling** strutturato e schemi **Zod**.

```
UI (drawer / pagina) → /api/assistant/v2/chat
  → Auth Clerk + AssistantAuthContext (server)
  → generateText + tool registry filtrato per ruolo
  → read tools: esecuzione immediata via server actions
  → write tools: pending (AssistantPendingAction) + conferma UI
  → /api/assistant/v2/chat { confirmPendingId } → claim atomico → commit
```

Principio: l’AI non ha SQL arbitrario. Solo tool applicativi validati e autorizzati.

Il motore legacy (`lib/assistant/*`) resta disponibile se `ASSISTANT_V2_ENABLED` è disattivo (rollback).

## Modello AI

- Provider: OpenAI via AI SDK
- ENV: `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`)
- API: Chat Completions con function/tool calling (SDK), non Responses API obbligatoria
- Un solo punto di configurazione modello: `lib/assistant-v2/config.ts`

## Feature flag

| Variabile | Effetto |
|-----------|---------|
| `ASSISTANT_V2_ENABLED=true` | Attiva UI V2 + API `/api/assistant/v2/*` |
| assente / false | Motore legacy invariato |

Rollback: rimuovere o mettere `false` la variabile e rideploy.

## Tool registry

Catalogo in `lib/assistant-v2/tools/`:

- `daily-tasks.ts` — GENERAL + lettura/scrittura task
- `daily-tasks.ts` (contact) — Sentire cliente / Universo
- `clients.ts` — ricerca, scheda, creazione
- `works.ts` — board, stato, scadenze (`rescheduleWorkDeadline`), assegnazioni, archivio
- `ped.ts` — contenuti editoriali (distinti dalle DailyTask)
- `shootings.ts` — shooting e reel
- `renewals.ts` — scadenze/rinnovi
- `preventivi.ts` — read-only
- `categories.ts` — read-only
- `dashboard.ts` — stats read-only (ADMIN)

Ogni tool dichiara: nome, descrizione, schema Zod, permesso, kind read/write, risk, conferma, `execute` / `commit`.

## Autorizzazioni

`buildAssistantAuthContext` deriva ruolo e permessi da Clerk + DB.

- **ADMIN**: tool piattaforma (lavori, PED, dashboard, …)
- **AGENTE**: task personali, lettura clienti assegnati / preventivi; niente works/PED/dashboard write
- Password/credenziali: **non esposte** (`canReadCredentials: false`)
- Controlli ripetuti in ogni tool/server action — non nel prompt

## Conferme

Tabella `assistant_pending_actions`:

- TTL 30 minuti
- `idempotencyKey` unique
- claim atomico `pending → confirmed`
- hash payload: conferma alterata → blocco
- doppia conferma → “già eseguita”
- Conferma solo da pulsanti UI (niente “ok” testuale ambiguo)

## Persistenza chat

Riutilizza `ChatThread`, `ChatMessage`, `AssistantActionLog`.  
Memoria V2 in `assistantContext.v2Memory` (ultimo cliente/lavoro/task).

## Date

`lib/assistant-v2/dates.ts` + helper esistenti (`todayDateOnlyRome`, date-only).  
Timezone: **Europe/Rome**.

## Env

```
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
ASSISTANT_V2_ENABLED=true
```

## Test

```bash
npm run test:assistant
npm run test:tasks
npm run test:works
npm run test:auth
npm run typecheck
npm run build
```

Suite qualità: `docs/ASSISTANT_V2_EVAL_SCENARIOS.md` (30+ prompt).

## Limiti noti / non ancora supportati

- Streaming token-by-token: elaborazione multi-step con feedback “Sto elaborando”; streaming SSE completo deferibile
- Batch atomico multi-create in un’unica transazione DB: batch con conferma multipla card per card
- Update anagrafica cliente parziale / delete cliente: create + read prioritari
- Invio email Brevo da assistente: **non implementato** (voluto)
- Calendario Google: non in V2
- Playwright e2e chat: non obbligatorio in questa release
- Eval automatica vs OpenAI live: scenari documentati, da eseguire manualmente / CI con chiave

## Privacy

- Redazione password/token nei log (`redactDeep`)
- Dati DB trattati come untrusted (sanitizzazione testi verso il modello)
- Nessun tool `execute_sql` / `fetch_any_url`
- Conversazioni isolate per `userId`
