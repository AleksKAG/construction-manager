#!/bin/bash
# Скрипт для применения исправлений БД

set -e

echo "=== DB Fix Script ==="
echo "Date: $(date)"

# Проверяем наличие переменных окружения
if [ -z "$DATABASE_URL" ]; then
    # Пытаемся собрать из компонентов
    if [ -n "$POSTGRESQL_HOST" ] && [ -n "$POSTGRESQL_USER" ] && [ -n "$POSTGRESQL_PASSWORD" ] && [ -n "$POSTGRESQL_DBNAME" ]; then
        export DATABASE_URL="postgres://${POSTGRESQL_USER}:${POSTGRESQL_PASSWORD}@${POSTGRESQL_HOST}:${POSTGRESQL_PORT:-5432}/${POSTGRESQL_DBNAME}?sslmode=${POSTGRESQL_SSLMODE:-require}"
        echo "DATABASE_URL assembled from components"
    else
        echo "ERROR: DATABASE_URL is not set and cannot be assembled"
        echo "Please set DATABASE_URL or POSTGRESQL_* environment variables"
        exit 1
    fi
fi

echo "Using DATABASE_URL: ${DATABASE_URL:0:30}..."

# Проверяем доступность psql
if ! command -v psql &> /dev/null; then
    echo "Installing postgresql-client..."
    apt-get update -qq && apt-get install -y -qq postgresql-client
fi

# Применяем SQL скрипт
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="${SCRIPT_DIR}/fix_db.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "ERROR: SQL file not found: $SQL_FILE"
    exit 1
fi

echo "Applying SQL fixes from: $SQL_FILE"
psql "$DATABASE_URL" -f "$SQL_FILE"

echo ""
echo "=== DB Fix Complete ==="
