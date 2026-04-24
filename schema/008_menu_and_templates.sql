-- 008_menu_and_templates.sql
-- Таблица элементов меню проекта и строк шаблонов (ТЭП, сметы)
-- Требует расширение pgcrypto для gen_random_uuid()

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
