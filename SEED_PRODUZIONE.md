# Seed utenti sul database di produzione (Vercel)

Se dopo il login con Clerk vedi **"Accesso non autorizzato"**, il database usato in produzione non contiene ancora gli utenti. Inseriscili così:

## 1. Copia la `DATABASE_URL` di produzione

- Vercel → tuo progetto → **Settings** → **Environment Variables**
- Copia il valore di **`DATABASE_URL`** (icona occhio per mostrarlo)

## 2. Esegui lo script in locale con quella URL

Dal terminale, nella cartella del progetto:

```bash
DATABASE_URL="postgres://..." npx tsx scripts/seed-users.ts
```

Incolla al posto di `postgres://...` l’URL copiata da Vercel (tutta tra virgolette).

Esempio:

```bash
DATABASE_URL="postgres://user:password@host:5432/postgres?sslmode=require" npx tsx scripts/seed-users.ts
```

Dovresti vedere:

```
OK: davide@soiree.it
OK: alessia@soiree.it
...
Utenti inseriti/aggiornati: 5
```

## 3. Riprova il login

Ricarica il sito su Vercel e accedi di nuovo con la stessa email usata in Clerk (deve essere una di: davide@soiree.it, alessia@soiree.it, cristian.palazzolo@soiree.it, daniele@soiree.it, enrico@soiree.it).

---

**Nota:** L’email con cui fai login in Clerk deve essere **identica** a una di quelle inserite nel DB (stesso indirizzo, stesso maiuscole/minuscole).
