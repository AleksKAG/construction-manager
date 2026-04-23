# План миграции проекта на PostgreSQL

Документ фиксирует пошаговый переход с текущего SQLite-контура на PostgreSQL-контур.

## 1) Что уже готово в проекте

- PostgreSQL-совместимые SQL-миграции в `schema/*.sql`.
- Python-импортеры данных, которые уже работают через PostgreSQL DSN:
  - `scripts/import_ird.py`
  - `scripts/import_tep.py`
  - `scripts/import_sdr.py`
- One-shot скрипт `scripts/migrate_to_postgres.sh` для применения всех SQL-миграций.

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

4. **Переключить backend c SQLite на PostgreSQL**
   - Заменить `gorm.io/driver/sqlite` на `gorm.io/driver/postgres` в `cmd/api/main.go`.
   - Перейти с `DB_PATH` на `DATABASE_URL` в конфиге.
   - Обновить `Dockerfile`, `docker-compose.yml`, `entrypoint.sh` под PostgreSQL (убрать файловую синхронизацию SQLite).

5. **Обновить тесты**
   - Текущие unit-тесты используют in-memory SQLite.
   - Перевести тесты на PostgreSQL Testcontainer или отдельную тестовую БД.

6. **Проверка после переключения**
   - Smoke API: `/api/v1/health`, CRUD объектов/задач, шаблоны, реестры, СВОР.
   - Проверка индексов и уникальных ограничений по ключевым таблицам.

## 3) Что ещё нужно доделать (если не успели в этот релиз)

- Полное удаление SQLite-зависимостей (`go-sqlite3`, `gorm sqlite driver`).
- Полный рефактор deployment-скриптов, сейчас они заточены под файл `construction.db` и S3 sync.
- E2E-проверки производительности на PostgreSQL (пулы соединений, таймауты, индексы).
- Автоматические миграции в CI/CD (например, отдельный шаг deploy: `psql -f schema/*.sql`).
- План отката (rollback) при ошибках миграции в production.

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
