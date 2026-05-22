-- PostgreSQL migration for AI assistant RAG storage
-- Requires pgcrypto (gen_random_uuid) and pgvector extension.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    BEGIN
        EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector';
    EXCEPTION
        WHEN insufficient_privilege THEN
            RAISE NOTICE 'Skipping pgvector extension creation: insufficient privileges. AI RAG tables will not be created.';
    END;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        EXECUTE $SQL$
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
            )
        $SQL$;

        EXECUTE $SQL$
            CREATE INDEX IF NOT EXISTS idx_ai_chunks_project_source
                ON ai_document_chunks(project_id, source_table, source_id)
        $SQL$;

        EXECUTE $SQL$
            CREATE INDEX IF NOT EXISTS idx_ai_chunks_embedding_hnsw
                ON ai_document_chunks USING hnsw (embedding vector_cosine_ops)
        $SQL$;

        EXECUTE $SQL$
            CREATE INDEX IF NOT EXISTS idx_ai_chunks_metadata_gin
                ON ai_document_chunks USING gin (metadata)
        $SQL$;
    ELSE
        RAISE NOTICE 'pgvector extension is unavailable. Skipping AI RAG schema migration.';
    END IF;
END
$$;
