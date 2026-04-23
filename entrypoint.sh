#!/bin/sh
set -e

echo "=== Starting entrypoint script ==="

if [ -z "$DATABASE_URL" ]; then
    echo "=== ERROR: DATABASE_URL is not set ==="
    exit 1
fi

echo "DATABASE_URL is set, starting application..."

wait_for_postgres() {
    echo "=== Waiting for PostgreSQL ==="
    max_attempts="${DB_WAIT_MAX_ATTEMPTS:-30}"
    delay="${DB_WAIT_DELAY_SECONDS:-2}"
    attempt=1

    while [ "$attempt" -le "$max_attempts" ]; do
        if pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
            echo "=== PostgreSQL is ready ==="
            return 0
        fi
        echo "PostgreSQL is not ready yet (attempt ${attempt}/${max_attempts})..."
        attempt=$((attempt + 1))
        sleep "$delay"
    done

    echo "=== ERROR: PostgreSQL is not reachable via DATABASE_URL ==="
    return 1
}

apply_schema_migrations() {
    if [ "${RUN_DB_MIGRATIONS:-true}" != "true" ]; then
        echo "=== RUN_DB_MIGRATIONS=false, skip schema migrations ==="
        return 0
    fi

    echo "=== Applying SQL migrations from /app/schema ==="
    for file in /app/schema/*.sql; do
        [ -e "$file" ] || continue
        echo "Applying migration: ${file}"
        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
    done
    echo "=== SQL migrations applied ==="
}

wait_for_postgres
apply_schema_migrations

echo "=== Starting application ==="
exec "$@"
