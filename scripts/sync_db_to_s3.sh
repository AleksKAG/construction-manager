#!/bin/sh

# Скрипт для периодической выгрузки базы данных в S3
# Запускается в фоновом режиме вместе с основным приложением

S3_ENDPOINT="${S3_ENDPOINT:-https://s3.twcstorage.ru}"
S3_BUCKET="${S3_BUCKET}"
S3_ACCESS_KEY="${S3_ACCESS_KEY}"
S3_SECRET_KEY="${S3_SECRET_KEY}"
S3_REGION="${S3_REGION:-ru-1}"
DB_FILE_NAME="${DB_FILE_NAME:-construction.db}"
DB_PATH="${DB_PATH:-/data/construction.db}"
UPLOAD_INTERVAL="${UPLOAD_INTERVAL:-300}" # По умолчанию 300 секунд (5 минут)

echo "=== Starting S3 backup scheduler ==="
echo "Upload interval: ${UPLOAD_INTERVAL} seconds"
echo "Database path: ${DB_PATH}"
echo "S3 Bucket: ${S3_BUCKET}"

# Если параметры S3 не указаны, выходим
if [ -z "$S3_BUCKET" ] || [ -z "$S3_ACCESS_KEY" ] || [ -z "$S3_SECRET_KEY" ]; then
    echo "=== S3 credentials not provided, backup scheduler disabled ==="
    exit 0
fi

# Настраиваем aws cli
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
export AWS_DEFAULT_REGION="$S3_REGION"

# Функция для выгрузки БД в S3
upload_to_s3() {
    if [ -f "$DB_PATH" ]; then
        echo "=== Uploading database to S3 at $(date) ==="
        # Убираем перенаправление ошибок, чтобы видеть их в логах
        if aws s3 cp "$DB_PATH" "s3://${S3_BUCKET}/${DB_FILE_NAME}" --endpoint-url "$S3_ENDPOINT"; then
            echo "=== Database uploaded successfully to S3 ==="
        else
            echo "=== ERROR: Failed to upload database to S3 at $(date) ==="
        fi
    else
        echo "=== Warning: Database file not found at ${DB_PATH} ==="
    fi
}

# Первая загрузка сразу после старта
upload_to_s3

# Периодическая загрузка каждые UPLOAD_INTERVAL секунд
while true; do
    echo "=== Sleeping for ${UPLOAD_INTERVAL} seconds ==="
    sleep "$UPLOAD_INTERVAL"
    upload_to_s3
done
