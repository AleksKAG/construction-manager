-- PostgreSQL migration for AI assistant RAG storage
-- Requires pgcrypto (gen_random_uuid) and pgvector extensions.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ai_document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    source_table VARCHAR(64) NOT NULL,
    source_id UUID,
    source_title TEXT,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1024) NOT NULL,
    token_count INT DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chunks_project_source
    ON ai_document_chunks(project_id, source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_ai_chunks_embedding_hnsw
    ON ai_document_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_ai_chunks_metadata_gin
    ON ai_document_chunks USING gin (metadata);
