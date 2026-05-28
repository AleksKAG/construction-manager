-- Миграция 014: FMS — File Management System
-- Центральное хранилище файлов с AI-анализом и версионированием

-- files — центральное хранилище метаданных
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id TEXT NOT NULL,
    folder_path TEXT NOT NULL DEFAULT '/',
    name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    storage_key TEXT UNIQUE,
    temp_storage_key TEXT,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    content_type VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    -- статусы: pending, analyzing, requires_confirmation, approved, archived, deleted
    version INT NOT NULL DEFAULT 1,
    doc_type VARCHAR(50),
    designation VARCHAR(255),
    uploaded_by TEXT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    ai_metadata JSONB,
    -- {confidence, suggested_folder, version_action, explanation_for_user, requires_human_review}
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_project_folder ON files(project_id, folder_path);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_files_designation ON files(project_id, designation);

-- file_versions — история всех версий
CREATE TABLE IF NOT EXISTS file_versions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    version INT NOT NULL,
    storage_key TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    file_hash TEXT,
    uploaded_by TEXT,
    comment TEXT,
    is_current BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(file_id, version)
);

-- file_locks — блокировки для редактирования
CREATE TABLE IF NOT EXISTS file_locks (
    file_id TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
    locked_by TEXT NOT NULL,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- ai_analysis_results — результаты AI-анализа
CREATE TABLE IF NOT EXISTS ai_analysis_results (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    confidence REAL,
    suggested_folder TEXT,
    version_action VARCHAR(20), -- new | update | archive
    explanation_for_user TEXT,
    requires_human_review BOOLEAN NOT NULL DEFAULT true,
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Добавить link_references в document_registries если не существует
ALTER TABLE document_registries ADD COLUMN IF NOT EXISTS link_references JSONB;
