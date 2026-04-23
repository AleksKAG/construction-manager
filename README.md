# Construction Manager

Веб-приложение для **технического заказчика в строительстве**: управление проектами, задачами, шаблонами (ТЭП/сметы/графики), базовыми дашбордами и структурой проектной информации.

## Текущее состояние (на 15.04.2026)

### Что уже реализовано
- Backend на Go (`Gin` + `GORM`), подготовлен PostgreSQL-контур (docker-compose + entrypoint + SQL schema), runtime-переключение в `cmd/api/main.go` ещё в работе.
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
- GCC / build-essential (для `mattn/go-sqlite3`, пока runtime в `cmd/api/main.go` ещё на SQLite)

### 2) Настройка env
```bash
cp .env.example .env
```

Для локального запуска рекомендуется:
- `PORT=8080`
- `DATABASE_URL=postgres://postgres:postgres@localhost:5432/construction_manager?sslmode=disable`
- `RUN_DB_MIGRATIONS=true` (для контейнерного старта: автоматическое применение `schema/*.sql`)

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

> Обновлено для миграции на PostgreSQL: `docker-compose.yml` теперь поднимает отдельный контейнер `postgres` и экспортирует `DATABASE_URL` в API-контейнер.
> `entrypoint.sh` ждёт готовность PostgreSQL и накатывает SQL-миграции из `schema/*.sql` перед стартом API.

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

- SQLite подходит для небольших нагрузок и одного инстанса.
- Для нескольких реплик и высокой нагрузки лучше перейти на PostgreSQL.
- Добавьте мониторинг, ротацию логов и бэкапы volume.

Подробный пошаговый план и команды миграции: `docs/POSTGRES_MIGRATION_PLAN.md`.

## TEP шаблоны и миграция (добавлено)

В репозиторий добавлены примеры для следующего этапа:

- `seed/tep_templates.json` — стандартные шаблоны ТЭП (участок, онкоцентр, пансионат).
- `schema/004_tep_tables.sql` — PostgreSQL-миграция таблиц `tep_templates`, `tep_indicators`, `project_tep_values`.

> Примечание: SQL-файлы в `schema/` и контейнерный контур уже ориентированы на PostgreSQL; финальное переключение runtime в `cmd/api/main.go` остаётся отдельным шагом миграции.
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
