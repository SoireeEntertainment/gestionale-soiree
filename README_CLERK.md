# ⚠️ IMPORTANTE: Setup Clerk

## Modalità Sviluppo (Senza Clerk)

**Buone notizie!** Ho configurato l'applicazione per funzionare **senza Clerk** in modalità sviluppo. Puoi testare tutte le funzionalità subito!

L'app rileva automaticamente se Clerk è configurato:
- ✅ **Se Clerk NON è configurato**: L'app funziona in modalità sviluppo (tutte le route sono pubbliche)
- ✅ **Se Clerk È configurato**: L'app usa l'autenticazione completa

## Per Testare Subito (Senza Clerk)

1. **Assicurati di avere il database configurato**:
   ```bash
   npm run db:generate
   npm run db:push
   npm run db:seed
   ```

2. **Avvia il server**:
   ```bash
   npm run dev
   ```

3. **Apri http://localhost:3000** - Dovresti vedere il gestionale funzionante!

## Per Configurare Clerk (Produzione)

Quando sei pronto per usare l'autenticazione, segui la guida in `SETUP_CLERK.md`:

1. Crea account su https://clerk.com
2. Crea applicazione
3. Disabilita sign-up pubblico
4. Aggiungi le chiavi nel file `.env.local`:
   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

5. Riavvia il server - l'app passerà automaticamente alla modalità con autenticazione!

## Note

- In modalità sviluppo, vedrai "Dev" invece del UserButton di Clerk
- Tutte le funzionalità CRUD funzionano normalmente
- Quando aggiungi Clerk, tutto continuerà a funzionare senza modifiche al codice

