-- 006_schedule_tables.sql
-- Графики проектирования и СМР

CREATE TABLE IF NOT EXISTS schedule_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_task_id UUID REFERENCES schedule_tasks(id) ON DELETE CASCADE,
    contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
    wbs_code VARCHAR(50),
    name TEXT NOT NULL,
    task_type VARCHAR(20) NOT NULL,
    planned_start DATE,
    planned_end DATE,
    actual_start DATE,
    actual_end DATE,
    progress_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
    deviation_days INT GENERATED ALWAYS AS (
        CASE
            WHEN actual_end IS NOT NULL AND planned_end IS NOT NULL THEN (actual_end - planned_end)
            ELSE NULL
        END
    ) STORED,
    critical_path BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'planned',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_schedule_type CHECK (task_type IN ('design', 'construction')),
    CONSTRAINT chk_schedule_progress CHECK (progress_pct >= 0 AND progress_pct <= 100),
    CONSTRAINT chk_schedule_dates CHECK (
        planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start
    )
);

CREATE TABLE IF NOT EXISTS schedule_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    predecessor_task_id UUID NOT NULL REFERENCES schedule_tasks(id) ON DELETE CASCADE,
    successor_task_id UUID NOT NULL REFERENCES schedule_tasks(id) ON DELETE CASCADE,
    dependency_type VARCHAR(5) NOT NULL DEFAULT 'FS',
    lag_days INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT chk_dependency_type CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),
    CONSTRAINT chk_dependency_not_self CHECK (predecessor_task_id <> successor_task_id)
);

CREATE TABLE IF NOT EXISTS commissioning_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    milestone_name TEXT NOT NULL,
    planned_date DATE,
    actual_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'planned',
    authority VARCHAR(255),
    act_number VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_commissioning_status CHECK (status IN ('planned', 'in_progress', 'completed', 'delayed'))
);

CREATE INDEX IF NOT EXISTS idx_schedule_tasks_project_type ON schedule_tasks(project_id, task_type);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_parent ON schedule_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_contractor ON schedule_tasks(contractor_id);
CREATE INDEX IF NOT EXISTS idx_schedule_dependencies_project ON schedule_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_commissioning_project ON commissioning_milestones(project_id);
