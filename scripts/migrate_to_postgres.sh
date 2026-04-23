#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required."
  echo "Example:"
  echo "  export DATABASE_URL='postgresql://gen_user:password@5.42.122.236:5432/default_db?sslmode=require'"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is not installed."
  exit 1
fi

echo "==> Applying PostgreSQL schema..."
for file in \
  schema/001_initial_tables.sql \
  schema/002_ird_tables.sql \
  schema/003_project_docs.sql \
  schema/004_tep_tables.sql \
  schema/005_ssr_tables.sql \
  schema/006_schedule_tables.sql \
  schema/007_ai_rag.sql
do
  echo "  -> $file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
done

echo "==> Schema applied."
echo "==> Optional data import:"
echo "  python3 scripts/import_ird.py --dsn \"\$DATABASE_URL\" --json seed/ird_data.json --project-id <project_id>"
echo "  python3 scripts/import_tep.py --dsn \"\$DATABASE_URL\" --json seed/tep_templates.json"
echo "  python3 scripts/import_sdr.py --dsn \"\$DATABASE_URL\" --json seed/sdr_schedule_sample.json --project-id <project_id>"
