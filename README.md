# Construction Manager

Веб-приложение для **технического заказчика в строительстве**: управление проектами, задачами, шаблонами (ТЭП/сметы/графики), базовыми дашбордами и структурой проектной информации.

## Текущее состояние (на 01.04.2026)

### Что уже реализовано
- Backend на Go (`Gin` + `GORM` + `SQLite`).
- Базовые сущности: проекты, задачи графика, роли/пользователи, шаблоны и строки шаблонов.
- API для CRUD проектов и задач.
- API для шаблонов (`template definitions`, `columns`, `project rows`).
- Web UI (SPA на vanilla JS), подключенный к backend API.
- Dockerfile + docker-compose для запуска контейнера.

### Ограничения
- Полноценная JWT-авторизация пока не реализована.
- Нет Swagger/OpenAPI описания.
- Нет e2e/unit-тестов бизнес-логики.
- Модуль документов/протоколов пока в roadmap.

---

## Целевая архитектура

```text
construction-manager/
├── cmd/api/main.go              # точка входа
├── internal/
│   ├── handlers/                # HTTP handlers
│   ├── models/                  # GORM-модели
│   ├── repository/              # интерфейс репозитория + SQLite реализация
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
- GCC / build-essential (для `mattn/go-sqlite3`)

### 2) Настройка env
```bash
cp .env.example .env
```

Для локального запуска рекомендуется:
- `PORT=8080`
- `DB_PATH=/tmp/construction_ai.db`

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

### AI-агент (сводка проекта)
- `POST /api/v1/agent/summary`
- Тело запроса:
  ```json
  {
    "project_id": "1",
    "question": "Какие риски на 2 недели?"
  }
  ```
- Если задан `QWEN_API_KEY`, endpoint использует Qwen через OpenAI-compatible `/chat/completions`.
- Если задан `AI_PROVIDER=yandex_manager`, endpoint использует Yandex AI Studio Manager через `/v1/responses`.
- Если ключ не задан или Qwen недоступен, endpoint возвращает локально рассчитанную сводку.

Пример переменных окружения для Qwen:

```bash
QWEN_API_KEY=your_key
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
```

Пример переменных окружения для Yandex AI Manager:

```bash
AI_PROVIDER=yandex_manager
YANDEX_API_KEY=your_api_key
YANDEX_FOLDER_ID=your_folder_id
YANDEX_PROMPT_ID=your_prompt_id
YANDEX_BASE_URL=https://ai.api.cloud.yandex.net/v1
```

---

## План развития

- SQLite подходит для небольших нагрузок и одного инстанса.
- Для нескольких реплик и высокой нагрузки лучше перейти на PostgreSQL.
- Добавьте мониторинг, ротацию логов и бэкапы volume.

## TEP шаблоны и миграция (добавлено)

В репозиторий добавлены примеры для следующего этапа:

- `seed/tep_templates.json` — стандартные шаблоны ТЭП (участок, онкоцентр, пансионат).
- `schema/004_tep_tables.sql` — PostgreSQL-миграция таблиц `tep_templates`, `tep_indicators`, `project_tep_values`.

> Примечание: текущее приложение работает на SQLite через GORM. SQL-файл в `schema/` предназначен для целевого PostgreSQL-контура.
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
