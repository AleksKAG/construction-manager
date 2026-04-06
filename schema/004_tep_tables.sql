-- PostgreSQL migration: TEP templates and values
-- Requires: pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Таблица шаблонов ТЭП
-- 004_tep_tables.sql
-- Шаблоны ТЭП и значения по проектам

CREATE TABLE IF NOT EXISTS tep_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица индикаторов в шаблоне
CREATE TABLE IF NOT EXISTS tep_indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES tep_templates(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    required BOOLEAN DEFAULT FALSE,
    calculation_method VARCHAR(20),
    parent_key VARCHAR(100),
    sort_order INTEGER DEFAULT 0,
    UNIQUE(template_id, key)
);

-- Таблица значений ТЭП для проекта
CREATE TABLE IF NOT EXISTS project_tep_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tep_indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES tep_templates(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    required BOOLEAN NOT NULL DEFAULT FALSE,
    calculation_method VARCHAR(20) NOT NULL DEFAULT 'manual',
    parent_key VARCHAR(100),
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE(template_id, key)
);

CREATE TABLE IF NOT EXISTS project_tep_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES project_objects(id) ON DELETE CASCADE,
    indicator_key VARCHAR(100) NOT NULL,
    template_code VARCHAR(50) NOT NULL,
    value_numeric DECIMAL(15, 3),
    value_text TEXT,
    unit_override VARCHAR(20),
    is_calculated BOOLEAN DEFAULT FALSE,
    source_document_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, template_code, indicator_key)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_project_tep_project ON project_tep_values(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tep_template ON project_tep_values(template_code);
    is_calculated BOOLEAN NOT NULL DEFAULT FALSE,
    source_document_id UUID,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, template_code, indicator_key)
);

CREATE INDEX IF NOT EXISTS idx_project_tep_project ON project_tep_values(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tep_template ON project_tep_values(template_code);
CREATE INDEX IF NOT EXISTS idx_tep_indicators_template ON tep_indicators(template_id);
