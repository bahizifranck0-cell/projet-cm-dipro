#!/usr/bin/env bash
# Construction sur Vercel : migrations contrôlées → données de base → premier administrateur → compilation.
set -euo pipefail
echo "▶ Migrations de la base"
DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}" npx prisma migrate deploy
echo "▶ Permissions, rôles et moyen de paiement (sans donnée fictive)"
DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}" npx tsx scripts/seed.ts
echo "▶ Premier Super Administrateur (uniquement s'il n'en existe aucun)"
DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}" npx tsx scripts/bootstrap-admin.ts
echo "▶ Compilation"
npx next build
