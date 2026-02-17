# Setup Clerk - Guida Passo-Passo

## 1. Crea Account Clerk

1. Vai su https://clerk.com
2. Clicca su "Sign Up" o "Get Started"
3. Inserisci la tua email e crea una password
4. Verifica la tua email

## 2. Crea Nuova Applicazione

1. Una volta loggato, clicca su "Create Application"
2. Scegli un nome (es: "Soiree Gestionale")
3. Seleziona i provider di autenticazione:
   - **Email** (obbligatorio)
   - **Password** (obbligatorio per email/password)
4. Clicca "Create Application"

## 3. Abilita Email + Password

1. Vai su "User & Authentication" nel menu laterale
2. Clicca su "Email, Phone, Username"
3. Assicurati che siano abilitati:
   - **Email address** (Sign-in + Sign-up)
   - **Password** (Sign-in + Sign-up)
4. Disabilita "Allow users to sign up" se vuoi solo utenti invitati (consigliato)

## 4. Invita gli utenti

Gli utenti devono esistere in Clerk e nel DB con **la stessa email**. Il gestionale usa:
- davide@soiree.it
- cristian.palazzolo@soiree.it
- enrico@soiree.it
- daniele@soiree.it
- alessia@soiree.it

1. Vai su "Users" → "Invite User"
2. Inserisci l'email (es. davide@soiree.it)
3. L'utente riceve un invito e imposta la propria password
4. Esegui il seed del DB (`npm run db:seed`) per creare gli utenti con le stesse email

## 5. Ottieni le Chiavi API

1. Vai su "API Keys" nel menu laterale
2. Troverai due chiavi:
   - **Publishable Key** (inizia con `pk_test_` o `pk_live_`)
   - **Secret Key** (inizia con `sk_test_` o `sk_live_`)
3. Copia entrambe le chiavi

## 6. Configura il File .env

Crea un file `.env` nella root del progetto con:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... (la tua publishable key)
CLERK_SECRET_KEY=sk_test_... (la tua secret key)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
DATABASE_URL="postgresql://user:password@localhost:5432/soiree_db?schema=public"
```

## 7. Sync utenti DB

Gli utenti nel DB devono avere le stesse email di Clerk. Esegui il seed:
```bash
npm run db:seed
```
Creerà/aggiornerà gli utenti davide@soiree.it, cristian.palazzolo@soiree.it, ecc. Al primo accesso con Clerk, l'app associa automaticamente l'utente Clerk all'utente nel DB per email.

## 8. Riavvia il Server

Dopo aver configurato il `.env`, riavvia il server:

```bash
npm run dev
```

## 9. Produzione (Vercel)

1. **Variabili d’ambiente su Vercel**
   - Vercel → progetto **gestionale-soiree** → Settings → Environment Variables
   - Aggiungi (stessi valori usati in `.env.local` o le chiavi **live** quando le attivi):
     - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_test_...` (o `pk_live_...` in produzione)
     - `CLERK_SECRET_KEY` = `sk_test_...` (o `sk_live_...` in produzione)
     - `NEXT_PUBLIC_CLERK_SIGN_IN_URL` = `/sign-in`
     - `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` = `/dashboard`
     - `DATABASE_URL` = URL del database di produzione
   - Imposta le variabili per **Production** (e opzionalmente Preview). Poi **Redeploy**.

2. **Clerk Dashboard – URL di produzione**
   - Clerk → tua Application → **Paths** / **URLs** (o **Settings**)
   - Imposta **Home URL** (o **Application URL**) su:
     - `https://gestionale-soiree.vercel.app` (o in futuro `https://gestionale.soiree.it`)
   - In **Redirect URLs** (o **Allowed redirect URLs**) aggiungi:
     - `https://gestionale-soiree.vercel.app`
     - `https://gestionale-soiree.vercel.app/dashboard`
     - (Quando attivo) `https://gestionale.soiree.it`
     - (Quando attivo) `https://gestionale.soiree.it/dashboard`
   - Salva.

3. **Utenti e collegamento al DB**
   - Gli utenti che accedono devono esistere in Clerk (invito o sign-up se abilitato).
   - L’app collega automaticamente Clerk al DB per **email**: se l’email in Clerk coincide con un utente nel database (es. seed: davide@soiree.it, cristian.palazzolo@soiree.it, …), al primo accesso viene salvato `clerkId` su quell’utente.
   - Invita in Clerk gli utenti con **le stesse email** usate nel seed (o nel DB), così ruoli e permessi restano quelli già configurati.

4. **Rideploy**
   - Dopo aver impostato le variabili su Vercel, esegui un nuovo deploy (Redeploy) perché `NEXT_PUBLIC_*` vengono iniettate al momento del build.

## Note

- Per sviluppo, usa le chiavi `test` (pk_test_ e sk_test_)
- Per produzione, usa le chiavi `live` (pk_live_ e sk_live_)
- Le chiavi **test** di Clerk funzionano anche su domini non localhost (es. gestionale-soiree.vercel.app); per produzione “ufficiale” puoi passare a **live** e verificare il dominio in Clerk
- File di riferimento: `.env.example` elenca le variabili senza valori (non committare `.env` o `.env.local`)
- **Sicurezza:** se la secret key (sk_...) è stata incollata in chat o in file condivisi, dopo aver verificato che tutto funziona rigenerala in Clerk Dashboard → API Keys → Regenerate

