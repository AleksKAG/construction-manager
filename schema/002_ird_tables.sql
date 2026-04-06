-- 002_ird_tables.sql
-- ИРД: ГПЗУ, ТЗ, МТЗ, ТУ

CREATE TABLE IF NOT EXISTS ird_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    doc_type VARCHAR(20) NOT NULL,
    doc_number VARCHAR(100),
    issue_date DATE,
    expiry_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    issuer VARCHAR(255),
    notes TEXT,
    file_path TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ird_doc_type CHECK (doc_type IN ('GPZU', 'TZ', 'MTZ', 'TU')),
    CONSTRAINT chk_ird_status CHECK (status IN ('draft', 'active', 'expired', 'revoked')),
    CONSTRAINT chk_ird_dates CHECK (expiry_date IS NULL OR issue_date IS NULL OR expiry_date >= issue_date)
);

CREATE INDEX IF NOT EXISTS idx_ird_project ON ird_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_ird_type ON ird_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_ird_expiry ON ird_documents(expiry_date);
