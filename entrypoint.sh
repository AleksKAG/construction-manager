#!/bin/sh
set -e

echo "=== Starting entrypoint script ==="

# Параметры S3 из переменных окружения
S3_ENDPOINT="${S3_ENDPOINT:-https://s3.twcstorage.ru}"
S3_BUCKET="${S3_BUCKET}"
S3_ACCESS_KEY="${S3_ACCESS_KEY}"
S3_SECRET_KEY="${S3_SECRET_KEY}"
S3_REGION="${S3_REGION:-ru-1}"
DB_FILE_NAME="${DB_FILE_NAME:-construction.db}"
DB_PATH="${DB_PATH:-/data/construction.db}"

# Путь к файлу базы данных
DB_DIR=$(dirname "$DB_PATH")

# Создаём директорию для базы данных, если её нет
mkdir -p "$DB_DIR"

echo "S3 Endpoint: $S3_ENDPOINT"
echo "S3 Bucket: $S3_BUCKET"
echo "DB Path: $DB_PATH"

# Если указаны параметры S3, пытаемся скачать базу
if [ -n "$S3_BUCKET" ] && [ -n "$S3_ACCESS_KEY" ] && [ -n "$S3_SECRET_KEY" ]; then
    echo "=== Downloading database from S3 ==="
    
    # Настраиваем aws cli
    export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
    export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
    export AWS_DEFAULT_REGION="$S3_REGION"
    
    # Пробуем скачать базу из S3
    if aws s3 cp "s3://${S3_BUCKET}/${DB_FILE_NAME}" "$DB_PATH" --endpoint-url "$S3_ENDPOINT" 2>/dev/null; then
        echo "=== Database downloaded successfully ==="
        ls -la "$DB_PATH"
    else
        echo "=== Warning: Could not download database from S3 ==="
        echo "=== Database will be created if it doesn't exist ==="
    fi
else
    echo "=== S3 credentials not provided, skipping download ==="
fi

echo "=== Starting application ==="
exec "$@"
