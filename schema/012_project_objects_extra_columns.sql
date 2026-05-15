-- 012_project_objects_extra_columns.sql
-- Добавление колонок, которые есть в GORM-модели ProjectObject, но отсутствуют в изначальной SQL-схеме

ALTER TABLE project_objects
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS budget REAL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'planning',
    ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS characteristics TEXT DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS cost_estimates TEXT DEFAULT '{}';

-- Индекс для поиска по статусу
CREATE INDEX IF NOT EXISTS idx_project_objects_status ON project_objects(status);
