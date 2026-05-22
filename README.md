# Construction Manager

## Что обновлено (S3 + документооборот)

В проекте добавлен production-ready контур документооборота:
- presigned upload (клиент загружает файл сразу в S3, backend не проксирует тело файла);
- подтверждение загрузки с фиксацией `storage_key` и SHA-256 (`file_hash`) в PostgreSQL;
- версионирование по `project_id + designation`;
- история изменений и отдельная таблица версий.

## Быстрый запуск

```bash
cp .env.example .env
go run ./cmd/api
```

Проверка:
```bash
curl http://localhost:8080/api/v1/health
```

## Обязательные env для документов/S3

```bash
# Auth/API
JWT_SECRET=change_me
SERVICE_API_KEY=change_me

# S3
S3_ENDPOINT=https://storage.teamweb.ru
S3_BUCKET=your-bucket
S3_SECRET_KEY=your-secret
S3_PREP_URL_TTL=1h
S3_GET_URL_TTL=24h

# Важно: для инициализации таблиц документов
RUN_DB_MIGRATIONS=true
```

> Если `RUN_DB_MIGRATIONS=false`, API всё равно выполняет безопасную проверку и создаёт `documents/document_versions/document_changes` при старте.

## Документные API

Все роуты находятся в защищённой группе `/api/v1/documents`:
- `POST /presigned-url`
- `POST /confirm`
- `GET /download`
- `POST /compare`

Пример запроса presigned URL:
```json
{
  "project_id": "cc82c3b2-992e-4f08-8da1-f35c2bd34755",
  "doc_type": "ird",
  "designation": "AR-001",
  "filename": "specification.pdf",
  "content_type": "application/pdf",
  "size": 73400320
}
```

## Разбор ошибки «Network error during S3 PUT»

Если в UI после шага `PUT в S3` появляется browser-level ошибка:

1. Проверьте, что `S3_ENDPOINT` доступен из браузера (не только из backend контейнера).
2. Проверьте CORS на бакете TeamWeb S3 для методов `PUT, GET, HEAD, OPTIONS` и заголовков `Content-Type, Authorization, x-amz-*`.
3. Убедитесь, что `project_id` в presigned запросе — это **ID объекта/проекта**, а не название (иначе ключ и версия строятся некорректно).
4. Убедитесь, что таблица `documents` создана (иначе `/presigned-url` не сможет корректно считать версию).

## Типовые причины ошибки из логов

- `relation "documents" does not exist` — не применены миграции/инициализация схемы.
- `project_id = '«Онкологический центр...` — на фронт отправляется имя проекта вместо ID.

## Разработка через Docker

```bash
docker compose up --build
```

`entrypoint.sh` применяет `schema/*.sql` при `RUN_DB_MIGRATIONS=true`.
