-- fix_db.sql - Скрипт для исправления ошибок БД
-- Подключение: psql "$DATABASE_URL" -f fix_db.sql

\echo '=== Starting DB Fix Script ==='
\echo 'Date:' `SELECT NOW();`

-- 1. Исправление ограничения chk_ird_doc_type
-- Удаляем старое ограничение с жестким списком значений
\echo 'Fixing chk_ird_doc_type constraint...'
ALTER TABLE ird_documents DROP CONSTRAINT IF EXISTS chk_ird_doc_type;

-- Создаем новое ограничение - только проверка на непустое значение
ALTER TABLE ird_documents ADD CONSTRAINT chk_ird_doc_type CHECK (doc_type <> '');

-- 2. Создание недостающих таблиц (если их нет)
\echo 'Creating missing tables...'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Таблица определений шаблонов
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
ALTER TABLE template_definitions
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_template_definitions_code ON template_definitions(code);
COMMENT ON TABLE template_definitions IS 'Определения шаблонов: теп, сср, schedule, ird';
COMMENT ON COLUMN template_definitions.code IS 'Код шаблона: tep, ssr, schedule, ird';

-- Таблица колонок шаблонов
CREATE TABLE IF NOT EXISTS template_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_code VARCHAR(50) NOT NULL REFERENCES template_definitions(code) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    data_type VARCHAR(50) DEFAULT 'text',
    required BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(template_code, field_key)
);
CREATE INDEX IF NOT EXISTS idx_template_columns_template ON template_columns(template_code);
COMMENT ON TABLE template_columns IS 'Колонки шаблонов';

-- Таблица строк шаблонов проектов  
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
CREATE INDEX IF NOT EXISTS idx_template_rows_lookup ON project_template_rows(project_id, template_code);
CREATE INDEX IF NOT EXISTS idx_template_rows_project ON project_template_rows(project_id);
COMMENT ON TABLE project_template_rows IS 'Строки заполненных шаблонов (ТЭП, ССР, графики)';
COMMENT ON COLUMN project_template_rows.template_code IS 'Код шаблона: tep, ssr, schedule, ird';

-- 3. Вставка базовых шаблонов
\echo 'Inserting base templates...'
INSERT INTO template_definitions (code, name, description, is_active) VALUES
    ('tep', 'ТЭП', 'Технико-экономические показатели', true),
    ('ssr', 'ССР', 'Сводная сметная документация', true),
    ('schedule', 'График', 'Графики проектирования и СМР', true),
    ('ird', 'ИРД', 'Исходные данные для проектирования', true),
    ('docs', 'Документы', 'Документы проекта', true),
    ('phase_p_registry', 'Ведомость ПД', 'Ведомость комплектов стадии П', true),
    ('phase_r_registry', 'Ведомость РД', 'Ведомость комплектов стадии Р', true)
ON CONFLICT (code) DO NOTHING;

-- 4. Вставка колонок для шаблона docs (если нет)
INSERT INTO template_columns (template_code, field_key, title, data_type, required, sort_order) VALUES
    ('docs', 'doc_type', 'Тип документа', 'text', true, 1),
    ('docs', 'doc_number', 'Номер документа', 'text', false, 2),
    ('docs', 'issue_date', 'Дата выдачи', 'date', false, 3),
    ('docs', 'expiry_date', 'Срок действия', 'date', false, 4),
    ('docs', 'status', 'Статус', 'text', false, 5),
    ('docs', 'issuer', 'Выдавший орган', 'text', false, 6),
    ('docs', 'notes', 'Примечания', 'text', false, 7)
ON CONFLICT (template_code, field_key) DO NOTHING;

-- 5. Проверка результатов
\echo '=== Verification ==='
SELECT 'Constraint chk_ird_doc_type updated' AS status;
SELECT COUNT(*) AS template_definitions_count FROM template_definitions;
SELECT COUNT(*) AS template_columns_count FROM template_columns;
SELECT COUNT(*) AS project_template_rows_count FROM project_template_rows;

\echo '=== DB Fix Complete ==='
