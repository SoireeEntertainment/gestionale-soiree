#!/bin/bash
# Elimina dal PED tutte le task con data PRIMA della data indicata (la data indicata RESTA).
# Uso: ./scripts/delete-ped-before-date.sh 2026-02-16
# Per tenere dal 16 feb in poi: la data da passare è 2026-02-16 (si cancellano solo le task prima del 16).

DATE="${1:?Specifica la data (YYYY-MM-DD): le task prima di questa data verranno eliminate}"
DB="${DATABASE_URL:-file:../dev.db}"
DB_FILE="${DB#file:}"

if [ ! -f "$DB_FILE" ]; then
  echo "Database non trovato: $DB_FILE"
  exit 1
fi

COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM ped_items WHERE date < '$DATE';")
echo "Verranno eliminate $COUNT task con data prima di $DATE"
read -p "Confermi? (s/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[sS]$ ]]; then
  sqlite3 "$DB_FILE" "DELETE FROM ped_items WHERE date < '$DATE';"
  echo "Eliminate $(sqlite3 "$DB_FILE" "SELECT changes();") task."
else
  echo "Annullato."
fi
