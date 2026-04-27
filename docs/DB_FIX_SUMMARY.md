# Исправление ошибок БД - Сводка

## Проблемы выявленные в логах

### 1. Отсутствующие таблицы
- `project_template_rows` - таблица для хранения строк шаблонов (ТЭП, ССР, графики)
- `template_definitions` - таблица определений шаблонов

**Ошибка:**
```
ERROR: relation "project_template_rows" does not exist (SQLSTATE 42P01)
ERROR: relation "template_definitions" does not exist (SQLSTATE 42P01)
```

### 2. Ошибка ограничения chk_ird_doc_type
Ограничение не позволяло сохранять документы с произвольными типами.

**Ошибка:**
```
ERROR: new row for relation "ird_documents" violates check constraint "chk_ird_doc_type"
```

### 3. Ошибка формата даты
Пустые строки передавались в поле даты, что вызывало ошибку PostgreSQL.

**Ошибка:**
```
ERROR: invalid input syntax for type date: "" (SQLSTATE 22007)
```

## Применённые исправления

### 1. Обновлён обработчик CreateIrdFromTemplateRow
**Файл:** `/workspace/internal/handlers/ird_template_adapter.go`

Изменена логика обработки дат - пустые строки теперь корректно преобразуются в пустые значения для БД:

```go
// Обработка дат - только непустые значения
issueDate := strings.TrimSpace(input.Data["issue_date"])
expiryDate := strings.TrimSpace(input.Data["expiry_date"])

// Преобразуем пустые строки в пустые значения для БД
if issueDate == "" || issueDate == "null" {
    issueDate = ""
} else {
    if _, err := time.Parse("2006-01-02", issueDate); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "issue_date: используйте формат YYYY-MM-DD"})
        return
    }
}
```

### 2. Обновлены обработчики templates.go
**Файл:** `/workspace/internal/handlers/templates.go`

Добавлена специальная обработка для `input_design_data` (ИРД) - запросы перенаправляются на специализированные обработчики:

- `ListTemplateRows` → `ListIrdAsTemplateRows`
- `CreateTemplateRow` → `CreateIrdFromTemplateRow`

Это гарантирует что ИРД работает через правильную таблицу `ird_documents`, а не через несуществующую `project_template_rows`.

## Необходимые действия для развёртывания

### Вариант 1: Автоматическое применение SQL исправлений

```bash
export DATABASE_URL="postgres://user:password@host:5432/dbname?sslmode=require"
./scripts/run_db_fix.sh
```

### Вариант 2: Ручное выполнение SQL

```bash
psql "$DATABASE_URL" -f scripts/fix_db.sql
```

Или выполнить команды вручную:

```sql
-- 1. Исправить ограничение
ALTER TABLE ird_documents DROP CONSTRAINT IF EXISTS chk_ird_doc_type;
ALTER TABLE ird_documents ADD CONSTRAINT chk_ird_doc_type CHECK (doc_type <> '');

-- 2. Создать таблицы
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS template_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1,
    structure_json TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_template_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    template_code VARCHAR(50) NOT NULL,
    row_number INTEGER NOT NULL DEFAULT 1,
    values_json TEXT,
    created_by_user VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, template_code, row_number)
);

-- 3. Вставить базовые шаблоны
INSERT INTO template_definitions (code, name, description, is_active) VALUES
    ('tep', 'ТЭП', 'Технико-экономические показатели', true),
    ('ssr', 'ССР', 'Сводная сметная документация', true),
    ('schedule', 'График', 'Графики проектирования и СМР', true),
    ('ird', 'ИРД', 'Исходные данные для проектирования', true)
ON CONFLICT (code) DO NOTHING;
```

### Вариант 3: Использование GORM AutoMigrate

Установите переменную окружения:
```bash
export RUN_DB_MIGRATIONS=true
```

При запуске приложения GORM автоматически создаст недостающие таблицы.

## Проверка результатов

### 1. Проверка таблиц
```sql
SELECT COUNT(*) FROM template_definitions;
SELECT COUNT(*) FROM project_template_rows;
SELECT COUNT(*) FROM ird_documents;
```

### 2. Проверка ограничения
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'chk_ird_doc_type';
```

### 3. Тестирование API
```bash
# Получить список шаблонов
curl http://localhost:8080/api/v1/templates

# Получить ИРД шаблон
curl http://localhost:8080/api/v1/templates/input_design_data

# Создать ИРД документ (с пустыми датами)
curl -X POST http://localhost:8080/api/v1/objects/{project_id}/templates/input_design_data/rows \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "doc_type": "GPZU",
      "doc_number": "123",
      "issue_date": "",
      "expiry_date": "",
      "status": "active",
      "issuer": "Test Org"
    }
  }'
```

## Примечания

1. **Ошибка checkpoints_timed** в логах PostgreSQL не влияет на работу приложения - это мониторинговый запрос от стороннего инструмента (pgAdmin или аналогичный).

2. **Ошибка SSL connection** указывает на проблемы с подключением к PostgreSQL - проверьте настройки `pg_hba.conf` и параметры подключения.

3. После применения исправлений рекомендуется перезапустить приложение для применения миграций GORM.

4. Для новых проектов меню будет создано автоматически через `services.EnsureProjectMenus()`.
