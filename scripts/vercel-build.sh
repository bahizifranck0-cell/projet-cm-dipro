#!/usr/bin/env bash
# Construction sur Vercel : migrations contrôlées → données de base → premier administrateur → compilation.
set -euo pipefail

# Noms acceptés : ceux du guide (DATABASE_URL / DIRECT_URL) ou ceux de l'intégration Supabase de Vercel.
# Une base connectée depuis Vercel (Storage) est prioritaire : ses adresses sont fournies automatiquement.
# (quel que soit le préfixe choisi : POSTGRES_, STORAGE_…)
if [ -z "${POSTGRES_PRISMA_URL:-}" ]; then
  for v in $(compgen -e | grep -E '_PRISMA_URL$' || true); do
    POSTGRES_PRISMA_URL="${!v}"; base="${v%_PRISMA_URL}"; nonpool="${base}_URL_NON_POOLING"
    POSTGRES_URL_NON_POOLING="${!nonpool:-}"; break
  done
fi
if [ -n "${POSTGRES_PRISMA_URL:-}" ]; then
  export DATABASE_URL="$POSTGRES_PRISMA_URL"
  export DIRECT_URL="${POSTGRES_URL_NON_POOLING:-$POSTGRES_PRISMA_URL}"
fi
export DATABASE_URL="${DATABASE_URL:-}"
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"
# Retire espaces, guillemets et un éventuel « NOM= » collé par erreur dans la valeur
nettoie() { local v="$1"; v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"; v="${v#*_URL=}"; v="${v#[\"\']}"; v="${v%[\"\']}"; printf '%s' "$v"; }
export DATABASE_URL="$(nettoie "$DATABASE_URL")"
export DIRECT_URL="$(nettoie "$DIRECT_URL")"

manque=()
[ -z "$DATABASE_URL" ] && manque+=("DATABASE_URL (Supabase → Connect → ORMs → Prisma)")
[ -z "${STORAGE_DRIVER:-}" ] && manque+=("STORAGE_DRIVER = database")
for nom in DATABASE_URL DIRECT_URL; do
  val="${!nom}"
  if [ -n "$val" ] && [[ "$val" != postgresql://* && "$val" != postgres://* ]]; then
    if [[ "$val" == *COLLER_ICI* ]]; then manque+=("$nom : contient encore « COLLER_ICI » — collez l'adresse Supabase")
    else manque+=("$nom : doit commencer par postgresql:// (recopiez-la depuis Supabase → Connect → ORMs → Prisma)"); fi
  fi
done
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
