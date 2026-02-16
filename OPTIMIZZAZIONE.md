# Ottimizzazione e peso del progetto

## Peso attuale (indicativo)

- **Totale**: dipende soprattutto da `node_modules` e `.next`
- **node_modules**: dopo la pulizia ~300–500 MB di contenuto reale; su **disco esterno** (es. Extreme Pro) lo spazio occupato può essere maggiore a causa della dimensione dei blocchi del filesystem.
- **.next**: cache di build (~200–700 MB), eliminabile con `npm run clean`.
- **Codice app** (app/, components/, lib/, prisma/): pochi MB.

## Comandi utili

- **Pulire la cache di build**: `npm run clean` (rimuove `.next`)
- **Rimuovere file ._* da node_modules** (liberano molto spazio su disco esterno):  
  `npm run clean:dot`
- **Reinstallazione completa**: `npm run clean:full`  
  Oppure a mano: `rm -rf node_modules .next` e poi `npm install`. Dopo l’install, su macOS/disco esterno esegui `npm run clean:dot`.

## Cartelle rimosse o da ignorare

- **client/**: rimossa (era la vecchia cartella React, il progetto è Next.js).
- **._*** : file di risorsa macOS (AppleDouble); in `node_modules` possono pesare come il resto delle dipendenze. Usa `npm run clean:dot` dopo ogni `npm install` se il progetto è su disco esterno.
- **.next/**: generata da Next.js, in `.gitignore`.

## Ridurre il peso in sviluppo

1. Esegui `npm run clean` quando non serve la cache.
2. Se il progetto è su disco esterno e `node_modules` pesa molto, esegui `npm run clean:dot`.
3. Per una reinstallazione pulita: `npm run clean:full`, poi `npm run clean:dot`.
4. Non versionare `.next`, `node_modules`, `.env`, `*.db` (già in `.gitignore`).
