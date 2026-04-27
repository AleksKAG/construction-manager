-- 008_menu_and_templates.sql
-- Таблица элементов меню проекта и строк шаблонов (ТЭП, сметы)
-- Требует расширение pgcrypto для gen_random_uuid()

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Таблица определений шаблонов (теп, сср, schedule, ird)
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
CREATE INDEX idx_template_definitions_code ON template_definitions(code);
COMMENT ON TABLE template_definitions IS 'Определения шаблонов: теп, сср, schedule, ird';
COMMENT ON COLUMN template_definitions.code IS 'Код шаблона: tep, ssr, schedule, ird';
COMMENT ON COLUMN template_definitions.structure_json IS 'JSON со структурой полей шаблона';

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
CREATE INDEX idx_template_columns_template ON template_columns(template_code);
COMMENT ON TABLE template_columns IS 'Колонки шаблонов';

-- Таблица элементов меню проекта
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    view_key VARCHAR(255),
    item_type VARCHAR(50) DEFAULT 'section',
    sort_order INTEGER DEFAULT 0,
    parent_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
    is_visible BOOLEAN DEFAULT true,
    required_role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_menu_items_project ON menu_items(project_id, sort_order);
CREATE INDEX idx_menu_items_parent ON menu_items(parent_id);

-- Таблица строк шаблонов (ТЭП, сметы, графики)
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
CREATE INDEX idx_template_rows_lookup ON project_template_rows(project_id, template_code);
CREATE INDEX idx_template_rows_project ON project_template_rows(project_id);

-- Комментарии для документации
COMMENT ON TABLE menu_items IS 'Элементы навигационного меню проекта';
COMMENT ON COLUMN menu_items.item_type IS 'Тип элемента: section, link, dashboard';
COMMENT ON COLUMN menu_items.view_key IS 'Ключ представления для маршрутизации на фронтенде';

COMMENT ON TABLE project_template_rows IS 'Строки заполненных шаблонов (ТЭП, ССР, графики)';
COMMENT ON COLUMN project_template_rows.template_code IS 'Код шаблона: tep, ssr, schedule, ird';
COMMENT ON COLUMN project_template_rows.values_json IS 'JSON с данными строки: {"key": "value", ...}';
