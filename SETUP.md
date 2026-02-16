# Setup Gestionale Soirëe Studio

## Prerequisiti

- Node.js 18+ 
- PostgreSQL database
- Account Clerk (per autenticazione)

## Installazione

### 1. Installare dipendenze

```bash
npm install
```

### 2. Configurare variabili d'ambiente

Crea un file `.env` nella root del progetto:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Database PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/soiree_db?schema=public"

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Setup Clerk

1. Vai su [clerk.com](https://clerk.com) e crea un account
2. Crea una nuova applicazione
3. **IMPORTANTE**: Disabilita il sign-up pubblico
   - Vai su "User & Authentication" → "Email, Phone, Username"
   - Disabilita "Allow users to sign up"
4. Aggiungi fino a 5 utenti tramite inviti
5. Copia le chiavi API nel file `.env`

### 4. Setup Database

```bash
# Genera Prisma Client
npm run db:generate

# Crea database e applica schema
npm run db:push

# Seed categorie iniziali (Social, ADV, Foto/Video, Website, Grafica)
npm run db:seed
```

### 5. Avvia il server di sviluppo

```bash
npm run dev
```

L'applicazione sarà disponibile su `http://localhost:3000`

## Funzionalità Implementate

✅ **Autenticazione**
- Login con Clerk
- Protezione route con middleware
- Supporto per 5 utenti interni (invitation-only)

✅ **Clienti**
- CRUD completo
- Dettaglio con tab Categorie e Lavori
- Ricerca e filtri

✅ **Categorie**
- CRUD completo
- Seed iniziale (5 categorie)
- Dettaglio con tab Clienti e Lavori

✅ **Lavori**
- CRUD completo
- Filtri per cliente, categoria, stato, scadenza
- Deadline con indicatore scaduto
- Priorità (LOW, MEDIUM, HIGH)

✅ **Relazioni Bidirezionali**
- Cliente → Categorie (con stato aggiornabile)
- Categoria → Clienti (con stato aggiornabile)
- Stato ClientCategory: NOT_ACTIVE, ACTIVE, IN_PROGRESS, ON_HOLD, COMPLETED

✅ **Calendario/Agenda**
- Vista per giorno
- Filtri: Oggi, 7 giorni, 30 giorni, Questo mese
- Indicatori scaduti
- Click per dettaglio lavoro

✅ **Dashboard**
- Statistiche (clienti totali, lavori totali)
- Widget "In scadenza (7 giorni)"
- Widget "Scaduti"
- Widget "In revisione / Attesa cliente"

✅ **UI/UX**
- Design con colori brand (#0c0e11, #10f9c7, bianco)
- Font Roboto
- Modali per create/edit
- Tabelle responsive
- Toast notifications (da implementare completamente)

## Note Importanti

- Tutti gli utenti autenticati hanno permessi completi (admin)
- Il sign-up pubblico è disabilitato
- I lavori senza deadline non appaiono nel calendario
- Le scadenze scadute sono evidenziate in rosso

## Prossimi Passi (Opzionali)

- [ ] Implementare toast notifications complete
- [ ] Aggiungere ricerca full-text
- [ ] Esportazione dati
- [ ] Notifiche email per scadenze
- [ ] Dashboard analytics avanzate

