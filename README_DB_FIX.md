# Инструкция по исправлению ошибок БД

## Проблемы

1. **Ограничение `chk_ird_doc_type`** - не позволяет сохранять документы с произвольными типами
2. **Отсутствуют таблицы** `template_definitions` и `project_template_rows`
3. **Ошибки 404** при запросах к несуществующим проектам

## Решение

### Вариант 1: Автоматическое применение (рекомендуется)

```bash
# Установите переменные окружения
export DATABASE_URL="postgres://user:password@host:5432/dbname?sslmode=require"

# Или через компоненты
export POSTGRESQL_HOST=your_host
export POSTGRESQL_USER=your_user
export POSTGRESQL_PASSWORD=your_password
export POSTGRESQL_DBNAME=your_db
export POSTGRESQL_SSLMODE=require

# Запустите скрипт исправления
./scripts/run_db_fix.sh
```

### Вариант 2: Ручное выполнение SQL

```bash
psql "$DATABASE_URL" -f scripts/fix_db.sql
```

### Вариант 3: Пошаговое выполнение

```sql
-- 1. Исправить ограничение
ALTER TABLE ird_documents DROP CONSTRAINT IF EXISTS chk_ird_doc_type;
ALTER TABLE ird_documents ADD CONSTRAINT chk_ird_doc_type CHECK (doc_type <> '');

-- 2. Создать таблицы
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS template_definitions (...);
CREATE TABLE IF NOT EXISTS project_template_rows (...);

-- 3. Вставить базовые шаблоны
INSERT INTO template_definitions (code, name, description, is_active) VALUES
    ('tep', 'ТЭП', 'Технико-экономические показатели', true),
    ('ssr', 'ССР', 'Сводная сметная документация', true),
    ('schedule', 'График', 'Графики проектирования и СМР', true),
    ('ird', 'ИРД', 'Исходные данные для проектирования', true);
```

## Проверка результатов

```sql
-- Проверка ограничения
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'chk_ird_doc_type';

-- Проверка таблиц
SELECT COUNT(*) FROM template_definitions;
SELECT COUNT(*) FROM project_template_rows;

-- Проверка проектов
SELECT id, name FROM projects LIMIT 5;
```

## Дополнительные действия

### Создание тестового проекта

```bash
curl -X POST http://localhost:8080/api/v1/objects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Тестовый объект",
    "address": "Москва",
    "budget": 100000000
  }'
```

### Перезапуск сервера

После применения исправлений перезапустите сервер для применения миграций GORM:

```bash
# Остановить текущий процесс
killall construction-manager || true

# Запустить заново
cd /workspace && go run cmd/api/main.go
```

## Примечания

- Ошибка `checkpoints_timed` в `pg_stat_bgwriter` не влияет на работу приложения - это мониторинговый запрос от стороннего инструмента
- После исправления ограничения ИРД будет принимать любые непустые значения `doc_type`
- Таблицы шаблонов будут созданы автоматически через GORM AutoMigrate при старте приложения
