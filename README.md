# Gestionale Soirëe Studio

Sistema di gestione completo per Soirëe Studio con Next.js, Clerk, Prisma e PostgreSQL.

## Stack Tecnologico

- **Next.js 14** (App Router) + TypeScript
- **Clerk** per autenticazione
- **PostgreSQL** + Prisma ORM
- **Zod** per validazione
- **Tailwind CSS** per styling
- **Radix UI** per componenti UI

## Setup

### 1. Installazione dipendenze

```bash
npm install
```

### 2. Configurazione variabili d'ambiente

Crea un file `.env` basato su `.env.example`:

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/soiree_db?schema=public"

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Setup Database

```bash
# Genera Prisma Client
npm run db:generate

# Crea database e applica schema
npm run db:push

# Seed categorie iniziali
npm run db:seed
```

### 4. Avvio sviluppo

```bash
npm run dev
```

## Google Calendar Integration Setup

Per integrare il calendario Google (account soiree.teamwork@gmail.com) con creazione/modifica/eliminazione eventi dal gestionale:

1. **Google Cloud Console**: crea un progetto (o usa uno esistente).
2. **Abilita "Google Calendar API"**: API e servizi → Libreria → cerca "Google Calendar API" → Abilita.
3. **Crea un Service Account**: API e servizi → Credenziali → Crea credenziali → Account di servizio. Inserisci nome e continua (nessun ruolo necessario a livello progetto).
4. **Crea e scarica la key JSON**: nella scheda dell’account di servizio → Chiavi → Aggiungi chiave → Nuova chiave → JSON. Salva il file in locale (non committarlo).
5. **Condivisione calendario** (account soiree.teamwork@gmail.com):
   - Apri [Google Calendar](https://calendar.google.com) con soiree.teamwork@gmail.com.
   - Impostazioni del calendario da usare → Condividi con determinate persone.
   - Aggiungi l’**email del Service Account** (es. `xxx@xxx.iam.gserviceaccount.com`).
   - Permesso: **"Apporta modifiche agli eventi"**.
6. **Variabili d’ambiente** (locale e su Vercel):
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: email del service account (es. `xxx@progetto.iam.gserviceaccount.com`).
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: contenuto del campo `private_key` del JSON (gestione newline: in env sostituire `\n` con `\\n`; il codice ripristina `\n`).
   - `GOOGLE_CALENDAR_ID`: ID del calendario (es. `primary` per il calendario principale, oppure l’ID specifico dalla configurazione del calendario).
   - `CALENDAR_ADMIN_USER_IDS`: ID Clerk (separati da virgola) degli utenti che possono creare/modificare/eliminare eventi (es. Davide Piccolo, Cristian Palazzolo).
   - **Opzionale (consigliato su Vercel):** `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`: intero JSON del service account in base64 (evita problemi di newline sulla PEM).
7. **Scope utilizzato** (solo lettura/scrittura calendario): `https://www.googleapis.com/auth/calendar`.

**Vercel – evitare errore DECODER:** la PEM in env con newline spesso causa `error:1E08010C:DECODER routines::unsupported`. Metodo consigliato: usare un solo env `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` con il file JSON del service account codificato in base64 (macOS: `base64 -i service-account.json | pbcopy`; Linux: `base64 -w 0 service-account.json`). In alternativa usare `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64` con la sola private key in base64.

## Configurazione Clerk

1. Crea un account su [Clerk](https://clerk.com)
2. Crea una nuova applicazione
3. Disabilita il sign-up pubblico (solo invitation)
4. Aggiungi fino a 5 utenti tramite inviti
5. Copia le chiavi API nel file `.env`

## Struttura Progetto

```
├── app/                    # Next.js App Router
│   ├── dashboard/          # Dashboard principale
│   ├── clients/            # Gestione clienti
│   ├── categories/         # Gestione categorie
│   ├── works/              # Gestione lavori
│   └── calendar/           # Calendario/Agenda
├── components/             # Componenti React
│   ├── ui/                 # Componenti UI riutilizzabili
│   ├── clients/            # Componenti clienti
│   ├── categories/         # Componenti categorie
│   └── works/              # Componenti lavori
├── lib/                    # Utilities e configurazioni
│   ├── prisma.ts          # Prisma Client
│   ├── validations.ts     # Schema Zod
│   └── toast.ts           # Toast notifications
├── prisma/                 # Prisma
│   ├── schema.prisma      # Schema database
│   └── seed.ts            # Seed iniziale
└── middleware.ts          # Middleware Clerk
```

## Funzionalità

### ✅ Implementate

- [x] Setup Next.js + TypeScript
- [x] Schema Prisma completo
- [x] Middleware Clerk per autenticazione
- [x] Dashboard base con statistiche
- [x] Layout e navigazione
- [x] Lista clienti

### 🚧 Da implementare

- [ ] CRUD completo clienti
- [ ] CRUD completo categorie
- [ ] CRUD completo lavori
- [ ] Vista bidirezionale Cliente⇄Categoria
- [ ] Calendario/Agenda
- [ ] Filtri e ricerca
- [ ] Modali/Drawer per create/edit
- [ ] Toast notifications
- [ ] Server Actions per CRUD

## Note

- Tutti gli utenti autenticati hanno permessi completi (admin)
- Il sistema supporta fino a 5 utenti interni
- Il sign-up pubblico è disabilitato (solo invitation)
