-- 012_auth_users.sql
-- Persistent application users for JWT authorization.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    username VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    password_hash TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'roles'
          AND column_name = 'id'
          AND data_type = 'text'
    ) THEN
        ALTER TABLE roles ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
    ELSE
        ALTER TABLE roles ALTER COLUMN id SET DEFAULT gen_random_uuid();
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'users'
          AND column_name = 'id'
          AND data_type = 'text'
    ) THEN
        ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
    ELSE
        ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
    ON users (LOWER(username))
    WHERE username IS NOT NULL AND username <> '';

CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

INSERT INTO roles (code, name) VALUES
    ('admin', 'Администратор'),
    ('editor', 'Редактор'),
    ('viewer', 'Наблюдатель')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
