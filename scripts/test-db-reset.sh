#!/usr/bin/env bash
# Recrée une base de TEST vierge (jamais la base réelle) puis applique les migrations.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL manquant}"
DB_NAME="${DATABASE_URL##*/}"; DB_NAME="${DB_NAME%%\?*}"
[[ "$DB_NAME" == *_test ]] || { echo "Refus : la base doit se terminer par _test ($DB_NAME)"; exit 1; }
ADMIN_URL="${DATABASE_URL%/*}/postgres"
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);" -c "CREATE DATABASE \"$DB_NAME\";"
npx prisma migrate deploy >/dev/null
echo "Base de test $DB_NAME prête."
