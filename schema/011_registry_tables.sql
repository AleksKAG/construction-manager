-- 011_registry_tables.sql
-- Реестры документации и учет рабочей силы
-- Требует расширение pgcrypto для gen_random_uuid()

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Таблица реестра документации (DocumentRegistry)
-- Хранит строки реестра проектной документации для стадий П/Р
CREATE TABLE IF NOT EXISTS document_registries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    stage VARCHAR(20) NOT NULL,
    volume_number INTEGER,
    code VARCHAR(100),
    mark VARCHAR(50),
    designation VARCHAR(255) NOT NULL,
    name TEXT NOT NULL,
    contractor VARCHAR(255),
    note TEXT,
    issue_date_fact DATE,
    revision_count INTEGER NOT NULL DEFAULT 0,
    revisions_json TEXT,
    synced_progress REAL NOT NULL DEFAULT 0,
    synced_status VARCHAR(50),
    linked_task_id UUID,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ux_registry_project_stage_designation UNIQUE (project_id, stage, designation)
);
CREATE INDEX IF NOT EXISTS idx_registries_project_stage ON document_registries(project_id, stage);
CREATE INDEX IF NOT EXISTS idx_registries_linked_task ON document_registries(linked_task_id);
COMMENT ON TABLE document_registries IS 'Реестр проектной документации (стадии П/Р)';
COMMENT ON COLUMN document_registries.revisions_json IS 'JSON массив с историей ревизий';

-- Таблица ежедневного учета рабочей силы (WorkforceDailyRecord)
-- План/факт по задачам на каждый день
CREATE TABLE IF NOT EXISTS workforce_daily_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    work_date DATE NOT NULL,
    planned INTEGER,
    actual INTEGER,
    reported_by VARCHAR(255),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workforce_task_date ON workforce_daily_records(task_id, work_date);
COMMENT ON TABLE workforce_daily_records IS 'Ежедневный учет план/факт рабочей силы по задачам';
