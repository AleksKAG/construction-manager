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

---

## План развития

1. Завершить auth слой: JWT + middleware + роли (`viewer/editor/admin`).
2. Добавить модуль документов и протоколов с загрузкой файлов.
3. Добавить OpenAPI/Swagger.
4. Покрыть сервисы тестами.
5. Улучшить дашборды и отчеты.
