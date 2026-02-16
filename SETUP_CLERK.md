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
   - Email (consigliato)
   - Opzionalmente: Google, GitHub, ecc.
4. Clicca "Create Application"

## 3. Disabilita Sign-Up Pubblico

1. Vai su "User & Authentication" nel menu laterale
2. Clicca su "Email, Phone, Username"
3. Trova la sezione "Allow users to sign up"
4. **Disabilita** questa opzione (solo invitation)
5. Salva le modifiche

## 4. Ottieni le Chiavi API

1. Vai su "API Keys" nel menu laterale
2. Troverai due chiavi:
   - **Publishable Key** (inizia con `pk_test_` o `pk_live_`)
   - **Secret Key** (inizia con `sk_test_` o `sk_live_`)
3. Copia entrambe le chiavi

## 5. Aggiungi Utenti (Invitation)

1. Vai su "Users" nel menu laterale
2. Clicca su "Invite User"
3. Inserisci l'email dell'utente
4. L'utente riceverà un'email di invito
5. Ripeti per tutti i 5 utenti interni

## 6. Configura il File .env

Crea un file `.env` nella root del progetto con:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... (la tua publishable key)
CLERK_SECRET_KEY=sk_test_... (la tua secret key)
DATABASE_URL="postgresql://user:password@localhost:5432/soiree_db?schema=public"
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 7. Riavvia il Server

Dopo aver configurato il `.env`, riavvia il server:

```bash
npm run dev
```

## Note

- Per sviluppo, usa le chiavi `test` (pk_test_ e sk_test_)
- Per produzione, usa le chiavi `live` (pk_live_ e sk_live_)
- Le chiavi test funzionano solo su localhost
- Le chiavi live funzionano su domini verificati

