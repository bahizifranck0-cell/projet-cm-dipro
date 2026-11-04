#!/usr/bin/env bash
# Lance les tests de bout en bout sur une base de test vierge.
set -euo pipefail
export DATABASE_URL="${E2E_DATABASE_URL:-postgresql://cmdpro:cmdpro_dev@localhost:5432/cmdpro_e2e_test}"
export STORAGE_DIR="${E2E_STORAGE_DIR:-$(mktemp -d)}"
export E2E_ADMIN_USER=superadmin E2E_ADMIN_PASS=AdminTest2026 COOKIE_SECURE=false
./scripts/test-db-reset.sh
CMDPRO_ADMIN_USERNAME=$E2E_ADMIN_USER CMDPRO_ADMIN_PASSWORD=$E2E_ADMIN_PASS npx tsx scripts/create-super-admin.ts
npx next build >/dev/null
node --import tsx --test --test-concurrency=1 ${@:-tests/e2e/*.test.ts}
