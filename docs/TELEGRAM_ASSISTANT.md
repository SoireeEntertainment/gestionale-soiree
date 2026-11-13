# Soirëe Telegram Assistant

Bot Telegram collegato al gestionale (`https://gestionale.soiree.it`) per consultare e gestire il **PED personale** e le **Task giornaliere** tramite messaggi testuali e vocali.

Usa il motore **Assistente V2** (`lib/assistant-v2`) e gli stessi permessi del gestionale. Non crea un secondo database PED.

## Feature flag

| Variabile | Default | Ruolo |
|-----------|---------|--------|
| `TELEGRAM_ASSISTANT_ENABLED` | `false` | Abilita webhook + worker + digest |
| `TELEGRAM_ASSISTANT_WRITES_ENABLED` | `false` | Consente conferme di scrittura (PED/task) |
| `ASSISTANT_V2_ENABLED` | `false` | Motore AI tool-calling (obbligatorio per chat) |
| `TELEGRAM_BOT_TOKEN` | — | Token BotFather (mai in codice/log) |
| `TELEGRAM_WEBHOOK_SECRET` | — | `secret_token` setWebhook |
| `TELEGRAM_BOT_USERNAME` | — | Username senza `@` per deep link |
| `OPENAI_API_KEY` | — | Turn AI + trascrizione vocali |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` | Modello speech-to-text |
| `CRON_SECRET` | — | Autorizza `/api/cron/telegram-assistant` |

## Architettura

```
Telegram → POST /api/integrations/telegram/webhook
         → verifica X-Telegram-Bot-Api-Secret-Token
         → enqueue TelegramJob (DB)
         → 200 OK immediato
         → after() + cron * * * * * → drainTelegramJobs
         → resolve TelegramConnection → CurrentUser (ALS)
         → runAssistantV2Turn / confirm / cancel
         → tool PED / DailyTask (stesse action del gestionale)
         → risposta Telegram (+ InlineKeyboard conferma)
```

Identità: **mai** cookie Clerk. Dopo linking verificato, `runWithRequestActor` espone l’utente a `getCurrentUser()` senza simulare sessioni.

## Setup manuale

1. Crea il bot con [@BotFather](https://t.me/BotFather) → `/newbot`.
2. Copia `TELEGRAM_BOT_TOKEN` e imposta `TELEGRAM_BOT_USERNAME`.
3. Genera `TELEGRAM_WEBHOOK_SECRET` (1–256 caratteri `A-Z a-z 0-9 _ -`).
4. Su Vercel (Preview/Production): aggiungi le variabili sopra. Lascia `TELEGRAM_ASSISTANT_ENABLED=false` finché non hai testato.
5. Deploy con migration `20261113100000_telegram_assistant`.
6. Imposta webhook:

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{
    \"url\": \"https://gestionale.soiree.it/api/integrations/telegram/webhook\",
    \"secret_token\": \"$TELEGRAM_WEBHOOK_SECRET\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }"
```

7. Verifica:

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

8. Nel gestionale: **Profilo → Collega Telegram** → apri deep link → `/start <token>`.
9. Testa testo (`/oggi`) e un vocale breve.
10. Abilita `TELEGRAM_ASSISTANT_WRITES_ENABLED=true` solo dopo test lettura ok.
11. Opt-in **Riepilogo quotidiano** nel Profilo (Europe/Rome).

## Sicurezza

- Solo chat `private` con `TelegramConnection` verificata.
- Utente `isActive=false` → accesso negato.
- Conferme scrittura via InlineKeyboard + `AssistantPendingAction` (TTL, hash, claim atomico).
- Rate limit per `telegramUserId`.
- Deduplicazione `update_id`.
- Nessun SQL libero / nessun bypass permessi dal modello.

## Test

```bash
npm run test:telegram
npm run test:assistant
npm run typecheck
```
