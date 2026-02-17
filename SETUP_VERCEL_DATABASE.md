# Database su Vercel (Postgres)

Su Vercel non si può usare un file SQLite: l’ambiente è serverless e non ha filesystem persistente. Il progetto usa **Postgres** sia in locale che in produzione.

## 1. Crea il database su Vercel

1. Vercel Dashboard → il tuo progetto **gestionale-soiree** → **Storage**.
2. **Create Database** → scegli **Postgres** (Vercel Postgres, powered by Neon).
3. Crea il database (nome es. `gestionale-db`).
4. Vercel aggiunge automaticamente le variabili d’ambiente al progetto, tra cui **`DATABASE_URL`** (e opzionalmente `POSTGRES_URL` ecc.). Non serve copiarle a mano.

## 2. Crea le tabelle (prima volta)

Dopo aver creato il database, le tabelle vanno create una volta. Puoi farlo da locale con la URL di produzione:

1. In Vercel → **Settings** → **Environment Variables**: copia il valore di `DATABASE_URL` (o usalo solo in locale senza mostrarlo).
2. Da terminale, nella cartella del progetto:

```bash
# Sostituisci con la tua DATABASE_URL (Postgres) di Vercel
DATABASE_URL="postgresql://..." npx prisma db push
```

In alternativa, se hai già collegato il progetto a Vercel e le env sono solo su Vercel, puoi usare **Vercel CLI**:

```bash
npx vercel env pull .env.vercel
DATABASE_URL=$(grep DATABASE_URL .env.vercel | cut -d '=' -f2-) npx prisma db push
```

Dopo `prisma db push` le tabelle esistono nel database di produzione.

## 3. Migrare i dati da dev.db (SQLite) a Postgres

Se hai già dati in `prisma/dev.db` e vuoi portarli su Postgres:

1. **Crea le tabelle su Postgres** (una sola volta):
   ```bash
   DATABASE_URL="postgres://..." npx prisma db push
   ```
   (usa la tua URL Postgres; sia `postgres://` che `postgresql://` vanno bene)

2. **Copia i dati** da SQLite a Postgres:
   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate-to-postgres
   ```
   Lo script legge da `prisma/dev.db` (o da `SQLITE_DB_PATH` se impostato) e scrive su Postgres. Puoi eseguirlo una sola volta.

3. **Su Vercel**: in **Settings → Environment Variables** imposta `DATABASE_URL` con la stessa URL Postgres, così il deploy userà lo stesso database.

**Importante:** non committare mai la URL del database (resta in `.env` / `.env.local`, già in `.gitignore`).

## 4. (Opzionale) Seed dati iniziali

Se vuoi solo dati iniziali (utenti, ecc.) in produzione senza migrare da SQLite:

```bash
DATABASE_URL="postgresql://..." npx prisma db seed
```

## 5. Sviluppo in locale

Il progetto ora richiede **Postgres** anche in locale (non più SQLite).

- **Opzione A – Neon (gratis):** [neon.tech](https://neon.tech) → crea un progetto e un database (es. `gestionale-dev`). Copia la connection string e in `.env` imposta:
  ```env
  DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
  ```
- **Opzione B – Docker:** avvia Postgres e usa ad es. `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gestionale"`.

Poi in locale:

```bash
npx prisma db push
npm run dev
```

## Riepilogo

| Ambiente   | Cosa fare |
|-----------|------------|
| **Vercel** | Storage → Create Database → Postgres; Vercel imposta `DATABASE_URL`. Poi una volta: `DATABASE_URL="..." npx prisma db push` da locale. |
| **Locale** | `.env` con `DATABASE_URL` Postgres (puoi usare la stessa URL di produzione o un DB separato); `npx prisma db push` e `npm run dev`. |

Se vedi ancora "Unable to open the database file" su Vercel, controlla che la variabile **DATABASE_URL** sia impostata in **Settings → Environment Variables** e che sia una URL **postgresql://** (non `file:...`).
