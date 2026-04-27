-- fix_constraints_and_tables.sql
-- Исправление ограничений и создание недостающих таблиц

-- 1. Удалить старое ограничение chk_ird_doc_type (если существует)
ALTER TABLE ird_documents DROP CONSTRAINT IF EXISTS chk_ird_doc_type;

-- 2. Создать новое ограничение с расширенным списком допустимых значений
-- Разрешаем любые непустые значения doc_type
ALTER TABLE ird_documents ADD CONSTRAINT chk_ird_doc_type CHECK (doc_type <> '');

-- 3. Убедиться что таблицы существуют (создать если нет)
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

-- 4. Добавить комментарии если нет
COMMENT ON TABLE template_definitions IS 'Определения шаблонов: теп, сср, schedule, ird';
COMMENT ON COLUMN template_definitions.code IS 'Код шаблона: tep, ssr, schedule, ird';
COMMENT ON TABLE project_template_rows IS 'Строки заполненных шаблонов (ТЭП, ССР, графики)';
COMMENT ON COLUMN project_template_rows.template_code IS 'Код шаблона: tep, ssr, schedule, ird';

-- 5. Опционально: вставить базовые определения шаблонов
INSERT INTO template_definitions (code, name, description, is_active) VALUES
    ('tep', 'ТЭП', 'Технико-экономические показатели', true),
    ('ssr', 'ССР', 'Сводная сметная документация', true),
    ('schedule', 'График', 'Графики проектирования и СМР', true),
    ('ird', 'ИРД', 'Исходные данные для проектирования', true)
ON CONFLICT (code) DO NOTHING;
