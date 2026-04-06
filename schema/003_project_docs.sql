-- 003_project_docs.sql
-- Состав стадий П/Р, тома и версии (Изм)

CREATE TABLE IF NOT EXISTS doc_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES doc_sections(id) ON DELETE SET NULL,
    code VARCHAR(20),
    mark VARCHAR(20),
    name TEXT NOT NULL,
    stage VARCHAR(10) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_doc_section_stage CHECK (stage IN ('P', 'RD'))
);

CREATE TABLE IF NOT EXISTS doc_volumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID REFERENCES doc_sections(id) ON DELETE SET NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    volume_code VARCHAR(80) NOT NULL,
    mark VARCHAR(20),
    name TEXT NOT NULL,
    stage VARCHAR(10) NOT NULL,
    block_id VARCHAR(30),
    floor_level VARCHAR(50),
    executor TEXT,
    issue_date DATE,
    revision_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    is_issued_to_production BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_doc_volume_stage CHECK (stage IN ('P', 'RD')),
    CONSTRAINT chk_doc_volume_status CHECK (
        status IN ('draft', 'submitted', 'remarks', 'revised', 'approved', 'issued')
    )
);

CREATE TABLE IF NOT EXISTS doc_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volume_id UUID NOT NULL REFERENCES doc_volumes(id) ON DELETE CASCADE,
    rev_number INT NOT NULL,
    change_date DATE,
    change_description TEXT,
    approved_by TEXT,
    file_path TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(volume_id, rev_number)
);

CREATE INDEX IF NOT EXISTS idx_doc_sections_project_stage ON doc_sections(project_id, stage);
CREATE INDEX IF NOT EXISTS idx_doc_sections_parent ON doc_sections(parent_id);
CREATE INDEX IF NOT EXISTS idx_doc_volumes_project_stage ON doc_volumes(project_id, stage);
CREATE INDEX IF NOT EXISTS idx_doc_revisions_volume ON doc_revisions(volume_id);
