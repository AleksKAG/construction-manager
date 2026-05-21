CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 doc_type VARCHAR(20) NOT NULL,
 designation VARCHAR(100) NOT NULL,
 version INT NOT NULL DEFAULT 1,
 storage_key TEXT NOT NULL UNIQUE,
 file_hash BYTEA NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'draft',
 name TEXT,
 size_bytes BIGINT NOT NULL,
 content_type VARCHAR(100),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_doc_designation ON documents(project_id, designation, version);
CREATE INDEX IF NOT EXISTS idx_doc_status ON documents(status);

CREATE TABLE IF NOT EXISTS document_versions (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
 version INT NOT NULL,
 storage_key TEXT NOT NULL,
 file_hash BYTEA NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(document_id, version)
);

CREATE TABLE IF NOT EXISTS document_changes (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
 change_type TEXT NOT NULL,
 payload JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
