-- 010_svor_tables.sql
-- СВОР: Ведомость выдачи рабочей документации
-- Требует расширение pgcrypto для gen_random_uuid()

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Таблица комплектов стадии П
CREATE TABLE IF NOT EXISTS doc_stage_ps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cipher VARCHAR(100) NOT NULL,
    name TEXT NOT NULL,
    section VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_stage_p_project ON doc_stage_ps(project_id);
CREATE INDEX IF NOT EXISTS idx_doc_stage_p_cipher ON doc_stage_ps(cipher);
COMMENT ON TABLE doc_stage_ps IS 'Ведомость комплектов стадии П';

-- Таблица комплектов стадии РД
CREATE TABLE IF NOT EXISTS doc_stage_rs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cipher_p_ref VARCHAR(100) NOT NULL,
    cipher_r VARCHAR(100) NOT NULL,
    name TEXT NOT NULL,
    issue_date DATE,
    current_version VARCHAR(20) NOT NULL DEFAULT '0',
    current_revision_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_stage_r_project ON doc_stage_rs(project_id);
CREATE INDEX IF NOT EXISTS idx_doc_stage_r_cipher ON doc_stage_rs(cipher_r);
CREATE INDEX IF NOT EXISTS idx_doc_stage_r_cipher_p_ref ON doc_stage_rs(cipher_p_ref);
COMMENT ON TABLE doc_stage_rs IS 'Текущее состояние комплекта РД';

-- Таблица ревизий РД
CREATE TABLE IF NOT EXISTS doc_stage_r_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_r_id UUID NOT NULL REFERENCES doc_stage_rs(id) ON DELETE CASCADE,
    revision_num VARCHAR(20) NOT NULL,
    revision_date TIMESTAMPTZ NOT NULL,
    change_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_stage_r_rev_doc ON doc_stage_r_revisions(doc_r_id);
COMMENT ON TABLE doc_stage_r_revisions IS 'История изменений РД';

-- Таблица записей СВОР
CREATE TABLE IF NOT EXISTS svor_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    doc_r_id UUID NOT NULL REFERENCES doc_stage_rs(id) ON DELETE CASCADE,
    submission_date DATE,
    contractor_feedback_date DATE,
    feedback_details TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    rd_version_snapshot TEXT,
    rd_revision_date_snapshot DATE,
    svor_version VARCHAR(20) NOT NULL DEFAULT '1',
    rd_adjustment_version VARCHAR(20),
    notes TEXT,
    lock_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_svor_record_project ON svor_records(project_id);
CREATE INDEX IF NOT EXISTS idx_svor_record_doc_r ON svor_records(doc_r_id);
CREATE INDEX IF NOT EXISTS idx_svor_record_status ON svor_records(status);
COMMENT ON TABLE svor_records IS 'Основная запись СВОР';

-- Таблица истории СВОР
CREATE TABLE IF NOT EXISTS svor_histories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    svor_record_id UUID NOT NULL REFERENCES svor_records(id) ON DELETE CASCADE,
    action_date TIMESTAMPTZ NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    comment TEXT,
    user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_svor_history_record ON svor_histories(svor_record_id);
CREATE INDEX IF NOT EXISTS idx_svor_history_action ON svor_histories(action_type);
CREATE INDEX IF NOT EXISTS idx_svor_history_user ON svor_histories(user_id);
COMMENT ON TABLE svor_histories IS 'Полный журнал изменений СВОР';
