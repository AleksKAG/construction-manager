# План миграции проекта на PostgreSQL

Документ фиксирует пошаговый переход с текущего SQLite-контура на PostgreSQL-контур.

## 1) Что уже готово в проекте

- PostgreSQL-совместимые SQL-миграции в `schema/*.sql`.
- Python-импортеры данных, которые уже работают через PostgreSQL DSN:
  - `scripts/import_ird.py`
  - `scripts/import_tep.py`
  - `scripts/import_sdr.py`
- One-shot скрипт `scripts/migrate_to_postgres.sh` для применения всех SQL-миграций.
- Контейнерный контур PostgreSQL:
  - `docker-compose.yml` поднимает отдельный `postgres` сервис и прокидывает `DATABASE_URL` в API.
  - `entrypoint.sh` ждёт готовность PostgreSQL (`pg_isready`) и применяет `schema/*.sql` через `psql`.
- Скрипт быстрой проверки прогресса миграции:
  - `scripts/check_postgres_migration.sh` — собирает статус по runtime, compose/entrypoint и оставшимся SQLite-ссылкам.

## 2) Пошаговый план корректировок

1. **Подготовить доступ к БД**
   - Проверить, что из окружения приложения доступен хост/порт PostgreSQL.
   - Для публичного подключения использовать SSL (`sslmode=require` или `verify-full` + сертификат).

2. **Поднять схему в PostgreSQL**
   - Выполнить:
     ```bash
     export DATABASE_URL='postgresql://gen_user:<PASSWORD>@5.42.122.236:5432/default_db?sslmode=require'
     ./scripts/migrate_to_postgres.sh
     ```

3. **Перенести данные**
   - Импортировать шаблоны/справочники через `scripts/import_*.py`.
   - Если нужно, добавить отдельный экспорт из SQLite и последующий импорт в PostgreSQL.

4. **Переключить backend c SQLite на PostgreSQL** ✅
   - ✅ Заменён runtime-драйвер в `cmd/api/main.go` на `gorm.io/driver/postgres`.
   - ✅ Убрано использование `DB_PATH`, основной источник подключения — `DATABASE_URL` (с fallback на `POSTGRES*/POSTGRESQL*`).
   - ✅ `docker-compose.yml` и `entrypoint.sh` используют PostgreSQL-режим по умолчанию.

5. **Обновить тесты** ✅
   - ✅ `internal/testutil/OpenTestDB` теперь работает только с PostgreSQL (`CM_TEST_DATABASE_URL`).
   - ✅ In-memory SQLite fallback удалён; при отсутствии DSN тесты с БД делают `Skip`.
   - ⏭️ Следующий шаг: автоматический подъем PostgreSQL в CI (Testcontainers/сервис БД).

6. **Проверка после переключения**
   - Smoke API: `/api/v1/health`, CRUD объектов/задач, шаблоны, реестры, СВОР.
   - Проверка индексов и уникальных ограничений по ключевым таблицам.
   - Прогон технического аудита:
     ```bash
     ./scripts/check_postgres_migration.sh
     ```

## 3) Что ещё нужно доделать (если не успели в этот релиз)

- ~~Переключить Go runtime (`cmd/api/main.go`) на драйвер PostgreSQL и убрать `DB_PATH`.~~ ✅ сделано.
- Полное удаление SQLite-зависимостей (`go-sqlite3`, `gorm sqlite driver`) из Go-кода и модулей — ✅ выполнено.
- Полный рефактор deployment-скриптов, сейчас они заточены под файл `construction.db` и S3 sync.
- E2E-проверки производительности на PostgreSQL (пулы соединений, таймауты, индексы).
- Автоматические миграции в CI/CD (например, отдельный шаг deploy: `psql -f schema/*.sql`).
- План отката (rollback) при ошибках миграции в production.

### Что взять в следующий заход (приоритетный чек-лист)

1. **Переключить runtime на PostgreSQL (обязательно)**
   - `cmd/api/main.go`: заменить `sqlite.Open(...)` на `postgres.Open(...)`.
   - Конфиг: перейти на `DATABASE_URL` как основной источник подключения.
   - Критерий готовности: приложение поднимается без `DB_PATH`, healthcheck зелёный.

2. **Доделать контейнерный контур под PostgreSQL (обязательно)**
   - `Dockerfile`, `docker-compose.yml`, `entrypoint.sh`: убрать SQLite-путь и синхронизацию db-файла.
   - Добавить `depends_on`/ожидание готовности PostgreSQL перед стартом API.
   - Критерий готовности: `docker compose up` поднимает API + PostgreSQL, CRUD работает.

3. **Перевести автотесты на PostgreSQL (обязательно)** ✅
   - ✅ In-memory SQLite убран из `internal/testutil`.
   - ✅ `go test ./...` проходит без sqlite-драйвера в зависимостях.
   - ⏭️ Следующий инкремент: автоматизировать подъем PostgreSQL (Testcontainers/CI service).

4. **Закрыть технический долг после switch-over (желательно в тот же заход)**
   - Удалить пакеты и упоминания SQLite из кода, `.env.example`, README.
   - Проверить/добавить индексы и уникальные ограничения на горячих таблицах.
   - Критерий готовности: в зависимостях и runtime-конфиге больше нет SQLite.

5. **Подготовить безопасный rollout (желательно)**
   - Зафиксировать backup + rollback runbook.
   - Прогнать smoke после миграции: `health`, проекты, задачи, шаблоны, реестры, workforce.
   - Критерий готовности: есть короткая инструкция «как откатиться за 5–10 минут».

## 4) Шаблоны подключения для вашего TWC PostgreSQL

### Вариант A: публичный IP (быстрее начать)

```bash
export DATABASE_URL='postgresql://gen_user:<PASSWORD>@5.42.122.236:5432/default_db?sslmode=require'
psql "$DATABASE_URL"
```

### Вариант B: приватный IP (из той же сети)

```bash
export DATABASE_URL='postgresql://gen_user:<PASSWORD>@192.168.0.4:5432/default_db?sslmode=disable'
psql "$DATABASE_URL"
```

### Вариант C: verify-full с сертификатом

```bash
export PGSSLROOTCERT="$HOME/.cloud-certs/root.crt"
export DATABASE_URL='postgresql://gen_user:<PASSWORD>@35953692442297acde82ea11.twc1.net:5432/default_db?sslmode=verify-full'
psql "$DATABASE_URL"
```

> Рекомендуется не хранить пароль в репозитории и не коммитить DSN в `.env`.
