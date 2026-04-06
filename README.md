# construction-manager

Go + Gin API для управления строительными объектами и задачами (Gantt), со встроенной SQLite базой.

## Быстрый запуск локально

### 1) Требования
- Go 1.22+ (рекомендуется)
- gcc / build-essential (нужен для `mattn/go-sqlite3`)

### 2) Переменные окружения
Скопируйте пример:

```bash
cp .env.example .env
```

По умолчанию:
- `PORT=8080`
- `DB_PATH=/data/construction_ai.db` (для контейнера)

Для локального запуска без Docker можно поставить `DB_PATH=/tmp/construction_ai.db`.

### 3) Запуск

```bash
go run ./cmd/api
```

Проверка:

```bash
curl http://localhost:8080/api/v1/health
```

Ожидаемый ответ: JSON со статусом `ok`.

---

## Проверка кода

```bash
go test ./...
go build ./...
```

В проекте пока нет unit-тестов, поэтому `go test` в основном проверяет сборку пакетов.

---

## Запуск через Docker Compose

Добавлены недостающие файлы для контейнерного запуска:
- `.env.example`
- `.dockerignore`
- `docker-compose.yml`

Шаги:

```bash
cp .env.example .env
docker compose up --build -d
curl http://localhost:8080/api/v1/health
```

Остановка:

```bash
docker compose down
```

С удалением volume БД:

```bash
docker compose down -v
```

---

## Как запустить на Timeweb Cloud

Ниже самый простой вариант через Docker + Container Registry Timeweb Cloud.

### 1) Подготовьте Docker image

В корне есть `Dockerfile`.

```bash
docker build -t construction-manager:latest .
```

### 2) Загрузите образ в реестр Timeweb Cloud

```bash
docker tag construction-manager:latest <registry>/<namespace>/construction-manager:latest
docker push <registry>/<namespace>/construction-manager:latest
```

### 3) Создайте контейнерный сервис в Timeweb Cloud

1. Создайте новый сервис/приложение из вашего образа.
2. Укажите порт контейнера: `8080`.
3. Добавьте переменные окружения:
   - `PORT=8080`
   - `DB_PATH=/data/construction_ai.db`
4. Смонтируйте постоянный volume в контейнер (например, `/data`), чтобы SQLite не терялась при перезапуске.

### 4) Проверьте доступность

```text
https://<ваш-домен>/api/v1/health
```

Если используется прокси/балансировщик, убедитесь, что он проксирует на порт `8080` контейнера.

---

## Что важно для продакшна

- SQLite подходит для небольших нагрузок и одного инстанса.
- Для нескольких реплик и высокой нагрузки лучше перейти на PostgreSQL.
- Добавьте мониторинг, ротацию логов и бэкапы volume.

## TEP шаблоны и миграция (добавлено)

В репозиторий добавлены примеры для следующего этапа:

- `seed/tep_templates.json` — стандартные шаблоны ТЭП (участок, онкоцентр, пансионат).
- `schema/004_tep_tables.sql` — PostgreSQL-миграция таблиц `tep_templates`, `tep_indicators`, `project_tep_values`.

> Примечание: текущее приложение работает на SQLite через GORM. SQL-файл в `schema/` предназначен для целевого PostgreSQL-контура.
