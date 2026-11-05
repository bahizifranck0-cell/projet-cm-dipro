#!/usr/bin/env bash
# Construction sur Vercel : migrations contrôlées → données de base → premier administrateur → compilation.
set -euo pipefail

# Noms acceptés : ceux du guide (DATABASE_URL / DIRECT_URL) ou ceux de l'intégration Supabase de Vercel.
export DATABASE_URL="${DATABASE_URL:-${POSTGRES_PRISMA_URL:-}}"
export DIRECT_URL="${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}"

manque=()
[ -z "$DATABASE_URL" ] && manque+=("DATABASE_URL (Supabase → Connect → ORMs → Prisma)")
[ -z "${STORAGE_DRIVER:-}" ] && manque+=("STORAGE_DRIVER = database")
if [ ${#manque[@]} -gt 0 ]; then
  echo "✖ Réglages manquants dans Vercel (Settings → Environment Variables) :"
  for m in "${manque[@]}"; do echo "   - $m"; done
  echo "  Ajoutez-les pour « Production » et « Preview », puis relancez le déploiement (Deployments → ⋯ → Redeploy)."
  exit 1
fi

echo "▶ Migrations de la base"
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
echo "▶ Permissions, rôles et moyen de paiement (sans donnée fictive)"
DATABASE_URL="$DIRECT_URL" npx tsx scripts/seed.ts
echo "▶ Premier Super Administrateur (uniquement s'il n'en existe aucun)"
DATABASE_URL="$DIRECT_URL" npx tsx scripts/bootstrap-admin.ts
echo "▶ Compilation"
npx next build
