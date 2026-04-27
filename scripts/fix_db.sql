-- fix_db.sql - Скрипт для исправления ошибок БД
-- Подключение: psql "$DATABASE_URL" -f fix_db.sql

-- 1. Исправление ограничения chk_ird_doc_type
-- Удаляем старое ограничение с жестким списком значений
ALTER TABLE ird_documents DROP CONSTRAINT IF EXISTS chk_ird_doc_type;

-- Создаем новое ограничение - только проверка на непустое значение
ALTER TABLE ird_documents ADD CONSTRAINT chk_ird_doc_type CHECK (doc_type <> '');

-- 2. Создание недостающих таблиц (если их нет)
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
CREATE INDEX IF NOT EXISTS idx_template_definitions_code ON template_definitions(code);

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

-- 3. Вставка базовых шаблонов
INSERT INTO template_definitions (code, name, description, is_active) VALUES
    ('tep', 'ТЭП', 'Технико-экономические показатели', true),
    ('ssr', 'ССР', 'Сводная сметная документация', true),
    ('schedule', 'График', 'Графики проектирования и СМР', true),
    ('ird', 'ИРД', 'Исходные данные для проектирования', true),
    ('phase_p_registry', 'Ведомость ПД', 'Ведомость комплектов стадии П', true),
    ('phase_r_registry', 'Ведомость РД', 'Ведомость комплектов стадии Р', true)
ON CONFLICT (code) DO NOTHING;

-- 4. Проверка результатов
SELECT 'Constraint chk_ird_doc_type updated' AS status;
SELECT COUNT(*) AS template_definitions_count FROM template_definitions;
SELECT COUNT(*) AS project_template_rows_count FROM project_template_rows;
