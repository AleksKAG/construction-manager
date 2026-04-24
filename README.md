# Construction Manager

Веб-приложение для **технического заказчика в строительстве**: управление проектами, задачами, шаблонами (ТЭП/сметы/графики), базовыми дашбордами и структурой проектной информации.

## Текущее состояние (на 24.04.2026)

### Что уже реализовано
- Backend на Go (`Gin` + `GORM`) уже работает через PostgreSQL runtime (`cmd/api/main.go`), включая docker-compose/entrypoint и SQL schema bootstrap.
- Базовые сущности: проекты, задачи графика, роли/пользователи, шаблоны и строки шаблонов.
- API для CRUD проектов и задач.
- API для шаблонов (`template definitions`, `columns`, `project rows`).
- Web UI (SPA на vanilla JS), подключенный к backend API.
- Dockerfile + docker-compose для запуска контейнера.

### Ограничения
- Полноценная JWT-авторизация пока не реализована.
- Нет Swagger/OpenAPI описания.
- Нет e2e/unit-тестов бизнес-логики.
- JWT-авторизация и OpenAPI пока не реализованы полностью.

---

## Целевая архитектура

```text
construction-manager/
├── cmd/api/main.go              # точка входа
├── internal/
│   ├── handlers/                # HTTP handlers
│   ├── models/                  # GORM-модели
│   ├── repository/              # интерфейс репозитория + GORM реализация
│   └── services/                # бизнес-логика и инициализация данных
├── web/                         # frontend (HTML/CSS/JS)
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Быстрый запуск (локально)

### 1) Требования
- Go 1.22+
- Доступный PostgreSQL (локальный контейнер или managed instance)

### 2) Настройка env
```bash
cp .env.example .env
```

Для локального запуска рекомендуется:
- `PORT=8080`
- `DATABASE_URL=postgres://postgres:postgres@localhost:5432/construction_manager?sslmode=disable`
- `APP_DB_ENGINE=postgres` (значение по умолчанию)
- `RUN_DB_MIGRATIONS=true` (для первого запуска, чтобы применить `schema/*.sql` и `AutoMigrate`)

Для production/managed PostgreSQL обычно лучше:
- `RUN_DB_MIGRATIONS=false` — тогда `entrypoint.sh` не запускает SQL-миграции и `cmd/api/main.go` пропускает `AutoMigrate`.

Альтернатива для managed PostgreSQL (когда включён `APP_DB_ENGINE=postgres`, если удобнее хранить поля отдельно, без ручной сборки DSN):
- `POSTGRESQL_HOST=5.42.122.236`
- `POSTGRESQL_PORT=5432`
- `POSTGRESQL_USER=gen_user`
- `POSTGRESQL_PASSWORD=********`
- `POSTGRESQL_DBNAME=default_db`
- `POSTGRESQL_SSLMODE=require` (по умолчанию именно `require`, если не задан)

### 3) Старт API + UI
```bash
go run ./cmd/api
```

Проверка:
```bash
curl http://localhost:8080/api/v1/health
```

UI:
```text
http://localhost:8080/
```

---

## Запуск через Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
curl http://localhost:8080/api/v1/health
docker compose down
```

> `entrypoint.sh` запускает PostgreSQL bootstrap при `APP_DB_ENGINE=postgres` (это значение по умолчанию).

### Troubleshooting PostgreSQL startup

- Ошибка вида `connection to server on socket "/run/postgresql/.s.PGSQL.5432" failed` обычно означает, что в `DATABASE_URL` не указан `host` (или DSN разобрался некорректно из-за спецсимволов в логине/пароле).  
  Используйте URL формата `postgres://user:pass@host:5432/dbname?sslmode=...` и URL-encoding для спецсимволов (например, `%40` для `@`).
- Если API запускается **в контейнере** через `docker-compose`, не используйте `localhost` как хост БД — нужен `postgres` (имя сервиса).
- Для PostgreSQL 17+ метрики `checkpoints_timed/checkpoints_req` перенесены из `pg_stat_bgwriter` в `pg_stat_checkpointer`, поэтому старый SQL-мониторинг нужно обновить.
  Пример совместимого запроса:
  ```sql
  WITH bg AS (
    SELECT
      buffers_checkpoint,
      buffers_clean,
      maxwritten_clean,
      buffers_backend,
      buffers_backend_fsync,
      buffers_alloc,
      stats_reset
    FROM pg_stat_bgwriter
  ),
  cp AS (
    SELECT
      checkpoints_timed,
      checkpoints_req,
      checkpoint_write_time,
      checkpoint_sync_time,
      stats_reset
    FROM pg_stat_checkpointer
  )
  SELECT
    cp.checkpoints_timed,
    cp.checkpoints_req,
    cp.checkpoint_write_time,
    cp.checkpoint_sync_time,
    bg.buffers_checkpoint,
    bg.buffers_clean,
    bg.maxwritten_clean,
    bg.buffers_backend,
    bg.buffers_backend_fsync,
    bg.buffers_alloc,
    COALESCE(cp.stats_reset, bg.stats_reset) AS stats_reset
  FROM bg
  CROSS JOIN cp;
  ```
  Для PostgreSQL 16 и ниже оставьте старый запрос к `pg_stat_bgwriter`.

---

## Ключевые API endpoints

### Проекты
- `GET /api/v1/objects`
- `POST /api/v1/objects`
- `GET /api/v1/objects/:id`
- `PUT /api/v1/objects/:id`
- `DELETE /api/v1/objects/:id`

### Задачи (график)
- `GET /api/v1/objects/:id/tasks`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/:id`
- `PUT /api/v1/tasks/:id`
- `DELETE /api/v1/tasks/:id`

### Шаблоны/таблицы проекта (ТЭП, сметы, графики)
- `GET /api/v1/templates/:code`
- `GET /api/v1/objects/:id/templates/:code/rows`
- `POST /api/v1/objects/:id/templates/:code/rows`
- `PUT /api/v1/objects/:id/templates/:code/rows/:rowId`
- `DELETE /api/v1/objects/:id/templates/:code/rows/:rowId`


### Реестр П/Р и синхронизация с задачами
- `GET /api/v1/projects/:id/design/:stage/registry` — получить строки реестра по стадии (`phase-p`/`phase-r`).
- `POST /api/v1/projects/:id/design/:stage/registry` — создать/обновить строку реестра и синхронизировать связанную задачу графика.

### Сводка рабочей силы (СМР)
- `GET /api/v1/projects/:id/smr/workforce` — список дневных записей по рабочей силе в проекте.
- `POST /api/v1/projects/:id/smr/workforce` — добавить дневную запись план/факт по задаче.

### AI-агент (сводка проекта)
- `POST /api/v1/agent/summary`
- Тело запроса:
  ```json
  {
    "project_id": "1",
    "question": "Какие риски на 2 недели?"
  }
  ```
- Если заданы `YANDEX_AI_API_KEY`, `YANDEX_AI_FOLDER_ID`, `YANDEX_AI_PROMPT_ID`, endpoint использует AI Manager от Yandex (`/v1/responses`).
- Если ключи не заданы или Yandex недоступен, endpoint возвращает локально рассчитанную сводку.

Пример переменных окружения для AI Manager Yandex:

```bash
YANDEX_AI_API_KEY=your_key
YANDEX_AI_FOLDER_ID=your_folder_id
YANDEX_AI_PROMPT_ID=your_prompt_id
YANDEX_AI_BASE_URL=https://ai.api.cloud.yandex.net/v1/responses
```

---

## План развития

- Базовый runtime уже переведён на PostgreSQL и требует `DATABASE_URL`.
- Следующий шаг миграции: полностью убрать SQLite-следы из legacy-скриптов и документации.
- Добавьте мониторинг, ротацию логов и бэкапы volume.

Подробный пошаговый план и команды миграции: `docs/POSTGRES_MIGRATION_PLAN.md`.

## TEP шаблоны и миграция (добавлено)

В репозиторий добавлены примеры для следующего этапа:

- `seed/tep_templates.json` — стандартные шаблоны ТЭП (участок, онкоцентр, пансионат).
- `schema/004_tep_tables.sql` — PostgreSQL-миграция таблиц `tep_templates`, `tep_indicators`, `project_tep_values`.

> Примечание: SQL-файлы в `schema/`, runtime `cmd/api/main.go` и контейнерный контур уже ориентированы на PostgreSQL.
1. Завершить auth слой: JWT + middleware + роли (`viewer/editor/admin`).
2. Добавить модуль документов и протоколов с загрузкой файлов.
3. Добавить OpenAPI/Swagger.
4. Покрыть сервисы тестами.
5. Улучшить дашборды и отчеты.


## AI-ассистент с RAG (добавлено)

Добавлены заготовки для внедрения контекстного AI-ассистента под строительные проекты:

- `docs/ai_assistant_integration.md` — архитектура (React ↔ Gin ↔ pgvector ↔ YandexGPT), чек-лист и рекомендации по безопасности.
- `schema/007_ai_rag.sql` — PostgreSQL-миграция для `pgvector` и таблицы `ai_document_chunks`.
- `scripts/embed_existing_data.go` — one-shot backfill скрипт для чанкинга и загрузки эмбеддингов из таблиц `ird/stage_p/stage_r/estimates/protocols`.

> Скрипт в `scripts/embed_existing_data.go` помечен build-тегом `ignore` и запускается отдельно через `go run scripts/embed_existing_data.go`.
