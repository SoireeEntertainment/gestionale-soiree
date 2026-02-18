# Come rimuovere il dominio personalizzato da Clerk

Se non trovi il pulsante per togliere il dominio, prova in questo ordine.

---

## 1. Da **Domains** (la pagina che hai aperto)

- Vai su **Clerk Dashboard** → **Developers** (menu sinistro) → **Domains**.
- In alto dovrebbe esserci il dominio attivo (es. **gestionale.soiree.it**).
- Cerca:
  - un menu **⋮** (tre puntini) accanto al nome del dominio, oppure
  - un link tipo **"Remove domain"** / **"Delete domain"** / **"Clear domain"**, oppure
  - una tab **"Settings"** o **"Domain settings"** per quel dominio con opzione per rimuoverlo.

---

## 2. Da **Instance** / **Settings**

- Menu sinistro → in basso **"Instance"** oppure **"Settings"** (icona ingranaggio).
- Cerca una sezione tipo **"Domain"** / **"Production domain"** / **"Custom domain"**.
- Se c’è il dominio impostato, dovrebbe esserci **"Remove"** / **"Use default"** / **"Clear"**.

---

## 3. Cambiare dominio invece di rimuoverlo

Se **non** esiste "Remove domain" e c’è solo **"Change domain"**:

- Clicca **"Change domain"**.
- Nel campo **"New domain"** **lascia vuoto** oppure inserisci solo lo **slug dell’istanza Clerk** (es. `https://your-instance.clerk.accounts.dev` se te lo mostra Clerk).
- Conferma: in alcuni piani questo fa tornare Clerk ai domini predefiniti (*.clerk.accounts.dev / CDN).

**Attenzione:** verifica le avvertenze (sessioni invalidate, ecc.) prima di confermare.

---

## 4. Chiedere a Clerk (se proprio non lo trovi)

- In dashboard: **?** o **Help** in basso a sinistro, oppure **Support**.
- Oppure: [support.clerk.com](https://support.clerk.com) / email di supporto.
- Scrivi: *"I added a custom domain (gestionale.soiree.it) but DNS is not set up. How do I remove it so my app loads Clerk from the default CDN again?"*

---

## Dopo aver rimosso il dominio

1. In Clerk non deve esserci più un dominio personalizzato attivo.
2. Su **Vercel** le variabili `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY` restano le stesse (stessa istanza Clerk).
3. Fai un **Redeploy** su Vercel (opzionale ma consigliato).
4. Ricarica il sito: lo script dovrebbe caricarsi da `cdn.clerk.com` (o domini Clerk) e non più da `clerk.gestionale.soiree.it`.
