#!/bin/sh
set -e

echo "=== Starting entrypoint script ==="

escape_conninfo_value() {
    # Escape single quotes for libpq conninfo: ' -> ''
    printf "%s" "$1" | sed "s/'/''/g"
}

build_database_url_from_parts() {
    if [ -n "$DATABASE_URL" ]; then
        return 0
    fi

    if [ -z "$POSTGRESQL_HOST" ] || [ -z "$POSTGRESQL_USER" ] || [ -z "$POSTGRESQL_PASSWORD" ] || [ -z "$POSTGRESQL_DBNAME" ]; then
        return 0
    fi

    pg_host=$(escape_conninfo_value "$POSTGRESQL_HOST")
    pg_port=$(escape_conninfo_value "${POSTGRESQL_PORT:-5432}")
    pg_user=$(escape_conninfo_value "$POSTGRESQL_USER")
    pg_password=$(escape_conninfo_value "$POSTGRESQL_PASSWORD")
    pg_dbname=$(escape_conninfo_value "$POSTGRESQL_DBNAME")
    pg_sslmode=$(escape_conninfo_value "${POSTGRESQL_SSLMODE:-require}")

    # Use libpq conninfo format to avoid URL-encoding issues for passwords.
    DATABASE_URL="host='${pg_host}' port='${pg_port}' user='${pg_user}' password='${pg_password}' dbname='${pg_dbname}' sslmode='${pg_sslmode}'"
    export DATABASE_URL

    echo "DATABASE_URL was built from POSTGRESQL_* variables."
}

build_database_url_from_parts

if [ -z "$DATABASE_URL" ]; then
    echo "=== ERROR: DATABASE_URL is not set ==="
    echo "Set DATABASE_URL directly or provide POSTGRESQL_HOST/PORT/USER/PASSWORD/DBNAME."
    exit 1
fi

echo "DATABASE_URL is set, starting application..."

extract_db_host() {
    case "$DATABASE_URL" in
        postgres://*|postgresql://*)
            after_scheme=${DATABASE_URL#*://}
            authority=${after_scheme%%/*}
            hostport=${authority##*@}
            host=${hostport%%:*}
            echo "$host"
            ;;
        *)
            # key=value DSN; require explicit host= to avoid fallback to local socket.
            host=$(printf "%s" "$DATABASE_URL" | sed -n 's/.*[[:space:]]host=\([^[:space:]]*\).*/\1/p')
            echo "$host"
            ;;
    esac
}

validate_database_url() {
    host=$(extract_db_host)
    if [ -z "$host" ]; then
        echo "=== ERROR: DATABASE_URL has no host; psql will fallback to local socket ==="
        echo "Provide host explicitly (e.g. ...@postgres:5432/... for docker-compose)."
        echo "If login/password contain special symbols, URL-encode them (%40 for @, etc)."
        return 1
    fi

    if [ "$host" = "localhost" ] || [ "$host" = "127.0.0.1" ]; then
        echo "=== WARNING: DATABASE_URL points to localhost from inside container ==="
        echo "If PostgreSQL runs in docker-compose service, use host 'postgres' instead of localhost."
    fi

    return 0
}

postgres_probe() {
    # pg_isready can be unreliable with URL params/SSL options on managed PG.
    # psql uses the same DSN as migrations, so it's a better readiness signal.
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc 'SELECT 1' >/dev/null 2>&1
}

wait_for_postgres() {
    echo "=== Waiting for PostgreSQL ==="
    max_attempts="${DB_WAIT_MAX_ATTEMPTS:-30}"
    delay="${DB_WAIT_DELAY_SECONDS:-2}"
    attempt=1

    while [ "$attempt" -le "$max_attempts" ]; do
        if postgres_probe; then
            echo "=== PostgreSQL is ready ==="
            return 0
        fi
        echo "PostgreSQL is not ready yet (attempt ${attempt}/${max_attempts})..."
        attempt=$((attempt + 1))
        sleep "$delay"
    done

    echo "=== ERROR: PostgreSQL is not reachable via DATABASE_URL ==="
    echo "=== Last connection error (for diagnostics) ==="
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT 1' || true
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

validate_database_url
wait_for_postgres
apply_schema_migrations

echo "=== Starting application ==="
exec "$@"
