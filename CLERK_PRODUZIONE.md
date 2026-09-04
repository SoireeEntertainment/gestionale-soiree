# Passare Clerk da Development a Production

Per rendere pubblico il gestionale con Clerk in produzione:

## 1. Dashboard Clerk

- Vai su [dashboard.clerk.com](https://dashboard.clerk.com)
- Seleziona la tua applicazione

## 2. Istanza Production

- Clerk ha due ambienti: **Development** e **Production**
- In alto nella dashboard passa da **Development** a **Production** (switch/toggle)
- In Production gli utenti sono “reali” e le chiavi sono diverse

## 3. Chiavi API di produzione

- In **Production**, vai in **API Keys**
- Copia:
  - **Publishable key** (inizia con `pk_live_...`)
  - **Secret key** (inizia con `sk_live_...`)

## 4. Variabili su Vercel

- Vercel → progetto → **Settings** → **Environment Variables**
- Aggiorna (o inserisci) per **Production** (e Preview se vuoi):
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = la publishable key **live** (`pk_live_...`)
  - `CLERK_SECRET_KEY` = la secret key **live** (`sk_live_...`)
- Salva e **ridistribuisci** il progetto (Redeploy)

## 5. Domini e redirect in Clerk (Production)

- In Clerk, in **Production**, vai in **Paths** / **URLs** (o **Configure**)
- **Allowed redirect URLs**: aggiungi l’URL del sito in produzione, es.  
  `https://gestionale.soiree.it/**`
- **Sign-in URL**: `/sign-in`
- **After sign-in URL**: `/dashboard`
- **After sign-out URL**: `/sign-in`

Se usi un **custom domain Clerk** (es. `clerk.gestionale.soiree.it`):

1. Deve appartenere alla stessa istanza **Production** delle chiavi `pk_live_` / `sk_live_` su Vercel
2. Non mescolare chiavi Development (`pk_test_`) con il dominio di produzione
3. I CNAME DNS devono puntare all’istanza Clerk corretta (Dashboard → Domains)
4. Dopo modifiche DNS/chiavi: Redeploy su Vercel e prova in **finestra incognito**

### Loop handshake (`session_token_consumed`)

Se Chrome con vecchia sessione resta in loop sul handshake Clerk mentre l’incognito funziona:

- è tipicamente una sessione/cookie obsoleto non più recuperabile
- l’app manda le sessioni non recuperabili a `/sign-in` (non ritenta il refresh sulla stessa pagina protetta)
- logout deve sempre usare `signOut({ redirectUrl: '/sign-in' })` di Clerk
- hard refresh o “Esci e accedi con un altro account” ripulisce lo stato

Se usi un dominio custom (es. `gestionale.soiree.it`), aggiungilo sia in Clerk che in Vercel (Domains).

## 6. Utenti in produzione

- In **Development** gli utenti sono di test
- In **Production** devi creare/invitare gli utenti dalla sezione **Users** di Clerk (invite by email)
- L’email dell’utente in Clerk deve **coincidere** con un utente nel database del gestionale (tabella `User`), altrimenti vedrà “Accesso non autorizzato”. Dopo aver fatto il seed in produzione (vedi `SEED_PRODUZIONE.md`), gli indirizzi sono già allineati.

## Riepilogo

1. Clerk Dashboard → passa a **Production**
2. Copia le chiavi **live** (`pk_live_...`, `sk_live_...`)
3. In Vercel imposta `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY` con quelle chiavi
4. In Clerk (Production) configura **Allowed redirect URLs** con il dominio Vercel
5. Ridistribuisci su Vercel e invita gli utenti in Clerk (Production) con le stesse email del DB
