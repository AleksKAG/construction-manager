-- 015_project_dashboard_fms.sql
-- Section 3.1/3.2 support: project dashboard metadata and FMS audit/versioning columns.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_total NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS region_code TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS chk_project_status;
ALTER TABLE projects ADD CONSTRAINT chk_project_status CHECK (
    status IN ('draft', 'design', 'construction', 'commissioning', 'completed', 'active', 'on_hold', 'archived')
);

CREATE TABLE IF NOT EXISTS user_dashboard_layouts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id TEXT NOT NULL,
    user_id TEXT,
    role_code TEXT NOT NULL,
    layout JSONB NOT NULL DEFAULT '[]'::jsonb,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id, role_code)
);

CREATE TABLE IF NOT EXISTS file_activity (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    user_id TEXT,
    action VARCHAR(50) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ai_confidence DOUBLE PRECISION,
    user_decision VARCHAR(50),
    prompt_hash TEXT,
    response_hash TEXT,
    ip_address INET,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE file_versions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_file_activity_project_resource ON file_activity(project_id, resource_id);
CREATE INDEX IF NOT EXISTS idx_user_dashboard_layout_project_role ON user_dashboard_layouts(project_id, role_code);
