#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== PostgreSQL migration audit =="
echo "Repo: $ROOT_DIR"
echo

runtime_driver="$(rg -n "gorm.io/driver/postgres|gorm.io/driver/sqlite" cmd/api/main.go || true)"
test_sqlite_refs="$(rg -n "gorm.io/driver/sqlite|go-sqlite3|sqlite\\.Open" internal --glob '*_test.go' || true)"
global_sqlite_refs="$(rg -n "go-sqlite3|gorm.io/driver/sqlite|DB_PATH|construction\\.db" \
  cmd internal scripts README.md docs go.mod docker-compose.yml entrypoint.sh 2>/dev/null || true)"

echo "[1/5] Runtime DB driver in cmd/api/main.go"
if grep -q "gorm.io/driver/postgres" cmd/api/main.go; then
  echo "  ✅ PostgreSQL driver import found."
else
  echo "  ❌ PostgreSQL driver import not found."
fi
echo "$runtime_driver" | sed 's/^/    /'
echo

echo "[2/5] docker-compose default engine"
if rg -q "APP_DB_ENGINE=\\$\\{APP_DB_ENGINE:-postgres\\}" docker-compose.yml; then
  echo "  ✅ APP_DB_ENGINE defaults to postgres in docker-compose."
else
  echo "  ❌ docker-compose still defaults to non-postgres engine."
fi
echo

echo "[3/5] entrypoint default engine"
if grep -Fq 'DB_ENGINE="${APP_DB_ENGINE:-postgres}"' entrypoint.sh; then
  echo "  ✅ entrypoint defaults bootstrap to postgres."
else
  echo "  ❌ entrypoint default engine is not postgres."
fi
echo

echo "[4/5] SQLite usage in tests"
if [[ -n "$test_sqlite_refs" ]]; then
  echo "  ⚠️  SQLite references remain in tests:"
  echo "$test_sqlite_refs" | sed 's/^/    /'
else
  echo "  ✅ No SQLite references in tests."
fi
echo

echo "[5/5] Remaining SQLite references across repo"
if [[ -n "$global_sqlite_refs" ]]; then
  echo "  ⚠️  Remaining references detected (expected while migration is incomplete):"
  echo "$global_sqlite_refs" | sed 's/^/    /'
else
  echo "  ✅ No SQLite-related references found."
fi
echo

echo "== Audit complete =="
