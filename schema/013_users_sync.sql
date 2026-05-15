-- 013_users_sync.sql
-- Синхронизация таблицы users между SQL-схемой и GORM-моделью

-- Добавляем password_hash (если отсутствует)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Добавляем is_active (если отсутствует), копируем значения из status если был
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
        -- Если есть колонка status, переносим значения
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'status'
        ) THEN
            UPDATE users SET is_active = (status = 'active');
        END IF;
    END IF;
END $$;
