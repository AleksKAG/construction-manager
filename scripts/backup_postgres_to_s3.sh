#!/bin/bash

# Скрипт для создания резервной копии PostgreSQL и выгрузки в S3
# Используется pg_dump для создания дампа базы данных

set -e

S3_ENDPOINT="${S3_ENDPOINT:-https://s3.twcstorage.ru}"
S3_BUCKET="${S3_BUCKET}"
S3_ACCESS_KEY="${S3_ACCESS_KEY}"
S3_SECRET_KEY="${S3_SECRET_KEY}"
S3_REGION="${S3_REGION:-ru-1}"
BACKUP_PREFIX="${BACKUP_PREFIX:-postgres_backup}"
UPLOAD_INTERVAL="${UPLOAD_INTERVAL:-86400}" # По умолчанию 24 часа (86400 секунд)
RETENTION_DAYS="${RETENTION_DAYS:-7}" # Хранить бэкапы за последние 7 дней

# Переменные для подключения к PostgreSQL
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_PASSWORD="${POSTGRES_PASSWORD}"
DB_NAME="${POSTGRES_DB:-construction_manager}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/${BACKUP_PREFIX}_${TIMESTAMP}.sql.gz"
BACKUP_FILE_LOCAL="/tmp/${BACKUP_PREFIX}_latest.sql.gz"

echo "=== PostgreSQL Backup to S3 ==="
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Backup file: ${BACKUP_FILE}"
echo "S3 Bucket: ${S3_BUCKET}"
echo "Upload interval: ${UPLOAD_INTERVAL} seconds (${UPLOAD_INTERVAL}s)"
echo "Retention: ${RETENTION_DAYS} days"

# Проверка наличия параметров S3
if [ -z "$S3_BUCKET" ] || [ -z "$S3_ACCESS_KEY" ] || [ -z "$S3_SECRET_KEY" ]; then
    echo "=== S3 credentials not provided, backup disabled ==="
    exit 0
fi

# Проверка наличия aws cli
if ! command -v aws >/dev/null 2>&1; then
    echo "=== AWS CLI is not installed. Install with: apk add --no-cache aws-cli ==="
    exit 1
fi

# Проверка наличия pg_dump
if ! command -v pg_dump >/dev/null 2>&1; then
    echo "=== pg_dump is not installed. Install with: apk add --no-cache postgresql-client ==="
    exit 1
fi

# Настройка AWS CLI
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
export AWS_DEFAULT_REGION="$S3_REGION"
export PGPASSWORD="$DB_PASSWORD"

# Функция для создания бэкапа и выгрузки в S3
backup_and_upload() {
    echo "=== Starting backup at $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
    
    # Создание дампа базы данных с сжатием
    if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" | gzip > "$BACKUP_FILE"; then
        echo "=== Backup created successfully: ${BACKUP_FILE} ==="
        
        # Копирование как latest
        cp "$BACKUP_FILE" "$BACKUP_FILE_LOCAL"
        
        # Выгрузка в S3
        S3_PATH="s3://${S3_BUCKET}/${BACKUP_PREFIX}/${BACKUP_PREFIX}_${TIMESTAMP}.sql.gz"
        if aws s3 cp "$BACKUP_FILE" "$S3_PATH" --endpoint-url "$S3_ENDPOINT"; then
            echo "=== Backup uploaded to S3: ${S3_PATH} ==="
            
            # Обновление latest бэкапа
            LATEST_PATH="s3://${S3_BUCKET}/${BACKUP_PREFIX}/${BACKUP_PREFIX}_latest.sql.gz"
            if aws s3 cp "$BACKUP_FILE_LOCAL" "$LATEST_PATH" --endpoint-url "$S3_ENDPOINT"; then
                echo "=== Latest backup updated: ${LATEST_PATH} ==="
            else
                echo "=== WARNING: Failed to update latest backup ==="
            fi
            
            # Удаление старых бэкапов
            echo "=== Cleaning up backups older than ${RETENTION_DAYS} days ==="
            aws s3 ls "s3://${S3_BUCKET}/${BACKUP_PREFIX}/" --endpoint-url "$S3_ENDPOINT" | \
                while read -r line; do
                    file_date=$(echo "$line" | awk '{print $1}')
                    file_name=$(echo "$line" | awk '{print $4}')
                    if [ -n "$file_date" ] && [ "$file_name" != "${BACKUP_PREFIX}_latest.sql.gz" ]; then
                        file_timestamp=$(date -d "$file_date" +%s 2>/dev/null || echo 0)
                        current_timestamp=$(date +%s)
                        age_days=$(( (current_timestamp - file_timestamp) / 86400 ))
                        if [ "$age_days" -gt "$RETENTION_DAYS" ]; then
                            echo "Deleting old backup: $file_name (age: ${age_days} days)"
                            aws s3 rm "s3://${S3_BUCKET}/${BACKUP_PREFIX}/${file_name}" --endpoint-url "$S3_ENDPOINT"
                        fi
                    fi
                done
        else
            echo "=== ERROR: Failed to upload backup to S3 ==="
            return 1
        fi
        
        # Очистка локальных файлов
        rm -f "$BACKUP_FILE" "$BACKUP_FILE_LOCAL"
        echo "=== Local backup files cleaned ==="
    else
        echo "=== ERROR: Failed to create backup ==="
        return 1
    fi
    
    echo "=== Backup cycle completed ==="
    return 0
}

# Первый бэкап сразу после старта
backup_and_upload

# Периодические бэкапы
echo "=== Starting backup scheduler ==="
while true; do
    echo "=== Sleeping for ${UPLOAD_INTERVAL} seconds ==="
    sleep "$UPLOAD_INTERVAL"
    backup_and_upload
done
