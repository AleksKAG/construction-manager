-- 005_ssr_tables.sql
-- Сводный сметный расчет (ССР)

CREATE TABLE IF NOT EXISTS ssr_chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL,
    chapter_number VARCHAR(10) NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_summary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS ssr_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES ssr_chapters(id) ON DELETE CASCADE,
    justification_code VARCHAR(100),
    name TEXT NOT NULL,
    constr_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
    install_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
    equip_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
    other_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_cost NUMERIC(18, 2) GENERATED ALWAYS AS (constr_cost + install_cost + equip_cost + other_cost) STORED,
    is_summary BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ssr_chapters_project ON ssr_chapters(project_id);
CREATE INDEX IF NOT EXISTS idx_ssr_items_chapter ON ssr_items(chapter_id);
