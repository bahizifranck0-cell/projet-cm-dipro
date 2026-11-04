#!/usr/bin/env bash
# Tests unitaires puis tests de services, chaque fichier sur une base de test vierge (isolation complète).
set -uo pipefail
: "${DATABASE_URL:?DATABASE_URL (base *_test) requis}"
fail=0
node --import tsx --test tests/unit/*.test.ts || fail=1
for f in tests/services/*.test.ts; do
  ./scripts/test-db-reset.sh >/dev/null || exit 1
  node --import tsx --test --test-concurrency=1 "$f" || fail=1
done
exit $fail
