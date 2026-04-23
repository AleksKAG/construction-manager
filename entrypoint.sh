#!/bin/sh
set -e

echo "=== Starting entrypoint script ==="

DB_ENGINE="${APP_DB_ENGINE:-postgres}"

log_step() {
    # UTC timestamp for easier correlation with platform logs.
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
}


escape_conninfo_value() {
    # Escape single quotes for libpq conninfo: ' -> ''
    printf "%s" "$1" | sed "s/'/''/g"
}

build_database_url_from_parts() {
    # Support both POSTGRESQL_* and POSTGRES_* variable families.
    pg_host="${POSTGRESQL_HOST:-${POSTGRES_HOST:-}}"
    pg_port="${POSTGRESQL_PORT:-${POSTGRES_PORT:-5432}}"
    pg_user="${POSTGRESQL_USER:-${POSTGRES_USER:-}}"
    pg_password="${POSTGRESQL_PASSWORD:-${POSTGRES_PASSWORD:-}}"
    pg_dbname="${POSTGRESQL_DBNAME:-${POSTGRES_DB:-}}"
    pg_sslmode="${POSTGRESQL_SSLMODE:-${POSTGRES_SSLMODE:-require}}"

    if [ -n "$DATABASE_URL" ]; then
        current_host=$(extract_db_host)
        if [ -n "$current_host" ]; then
            log_step "DATABASE_URL is already provided via environment."
            return 0
        fi
        log_step "DATABASE_URL is provided but host is empty/unparseable."
        log_step "Trying to assemble DATABASE_URL from POSTGRES*/POSTGRESQL* variables."
    fi

    if [ -z "$pg_host" ] || [ -z "$pg_user" ] || [ -z "$pg_password" ] || [ -z "$pg_dbname" ]; then
        log_step "DATABASE_URL is empty or invalid and POSTGRES*/POSTGRESQL* are incomplete; cannot assemble DSN from parts."
        return 0
    fi

    pg_host=$(escape_conninfo_value "$pg_host")
    pg_port=$(escape_conninfo_value "$pg_port")
    pg_user=$(escape_conninfo_value "$pg_user")
    pg_password=$(escape_conninfo_value "$pg_password")
    pg_dbname=$(escape_conninfo_value "$pg_dbname")
    pg_sslmode=$(escape_conninfo_value "$pg_sslmode")

    # Use libpq conninfo format to avoid URL-encoding issues for passwords.
    DATABASE_URL="host='${pg_host}' port='${pg_port}' user='${pg_user}' password='${pg_password}' dbname='${pg_dbname}' sslmode='${pg_sslmode}'"
    export DATABASE_URL

    log_step "DATABASE_URL assembled from POSTGRES*/POSTGRESQL* variables (password hidden)."
    log_step "Connection params: host=${pg_host} port=${pg_port} user=${pg_user} dbname=${pg_dbname} sslmode=${pg_sslmode}."
}

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
            host=$(printf "%s" "$DATABASE_URL" | sed -n "s/.*[[:space:]]host=\\([^[:space:]]*\\).*/\\1/p")
            if [ -z "$host" ]; then
                host=$(printf "%s" "$DATABASE_URL" | sed -n "s/^host=\\([^[:space:]]*\\).*/\\1/p")
            fi
            echo "$host"
            ;;
    esac
}

validate_database_url() {
    log_step "Validating DATABASE_URL format."
    host=$(extract_db_host)
    if [ -z "$host" ]; then
        echo "=== ERROR: DATABASE_URL has no host; psql will fallback to local socket ==="
        echo "Provide host explicitly (e.g. ...@postgres:5432/... for docker-compose)."
        echo "If login/password contain special symbols, URL-encode them (%40 for @, etc)."
        return 1
    fi

    log_step "DATABASE_URL host extracted: ${host}"

    if [ "$host" = "localhost" ] || [ "$host" = "127.0.0.1" ]; then
        echo "=== WARNING: DATABASE_URL points to localhost from inside container ==="
        echo "If PostgreSQL runs in docker-compose service, use host 'postgres' instead of localhost."
    fi

    return 0
}

postgres_probe() {
    # psql uses the same DSN as migrations, so it's the best readiness signal.
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc 'SELECT 1' >/dev/null 2>&1
}

wait_for_postgres() {
    echo "=== Waiting for PostgreSQL ==="
    max_attempts="${DB_WAIT_MAX_ATTEMPTS:-30}"
    delay="${DB_WAIT_DELAY_SECONDS:-2}"
    attempt=1

    log_step "Readiness settings: attempts=${max_attempts}, delay=${delay}s."

    while [ "$attempt" -le "$max_attempts" ]; do
        log_step "Trying PostgreSQL connection (attempt ${attempt}/${max_attempts})."
        if postgres_probe; then
            echo "=== PostgreSQL is ready ==="
            log_step "PostgreSQL probe succeeded on attempt ${attempt}."
            return 0
        fi
        echo "PostgreSQL is not ready yet (attempt ${attempt}/${max_attempts})..."
        log_step "Probe failed; sleeping ${delay}s before retry."
        attempt=$((attempt + 1))
        sleep "$delay"
    done

    echo "=== ERROR: PostgreSQL is not reachable via DATABASE_URL ==="
    echo "=== Last connection error (for diagnostics) ==="
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT 1' || true
    return 1
}

apply_schema_migrations() {
    if [ "${RUN_DB_MIGRATIONS:-false}" != "true" ]; then
        echo "=== RUN_DB_MIGRATIONS=false, skip schema migrations ==="
        return 0
    fi

    echo "=== Applying SQL migrations from /app/schema ==="
    log_step "RUN_DB_MIGRATIONS=true, starting schema migration run."
    for file in /app/schema/*.sql; do
        [ -e "$file" ] || continue
        echo "Applying migration: ${file}"
        log_step "Applying migration file ${file}."
        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
    done
    echo "=== SQL migrations applied ==="
    log_step "All SQL migrations completed successfully."
}

if [ "$DB_ENGINE" = "postgres" ]; then
    echo "APP_DB_ENGINE=postgres, PostgreSQL bootstrap is enabled."
    log_step "Bootstrap mode: postgres."
    build_database_url_from_parts

    if [ -z "$DATABASE_URL" ]; then
        echo "=== ERROR: DATABASE_URL is not set ==="
        echo "Set DATABASE_URL directly or provide POSTGRES*/POSTGRESQL* host/port/user/password/db values."
        exit 1
    fi

    log_step "DATABASE_URL is present; continue with validation."
    validate_database_url
    wait_for_postgres
    apply_schema_migrations
else
    echo "APP_DB_ENGINE=${DB_ENGINE}; skip PostgreSQL bootstrap and start app directly."
    log_step "Bootstrap mode: ${DB_ENGINE}. PostgreSQL steps skipped."
fi

log_step "Launching main process: $*"
echo "=== Starting application ==="
exec "$@"
