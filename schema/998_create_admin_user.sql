-- 998_create_admin_user.sql
-- Создаёт администратора с логином/паролем admin:admin, если его ещё нет

DO $$
DECLARE
    v_user_id TEXT;
    v_role_id TEXT;
BEGIN
    -- Создать пользователя admin, если нет
    IF NOT EXISTS (
        SELECT 1 FROM users WHERE LOWER(username) = 'admin' OR LOWER(email) = 'admin'
    ) THEN
        INSERT INTO users (id, username, email, full_name, password_hash, is_active, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'admin',
            'admin',
            'Администратор',
            '$2a$12$t0THJ3lKmG7o90IYbR5U4eHIYaNfJ1knKf73K5kGeSejS5DwObX2u',
            TRUE,
            NOW(),
            NOW()
        );
    END IF;

    -- Получить id пользователя admin
    SELECT id INTO v_user_id FROM users WHERE LOWER(username) = 'admin' OR LOWER(email) = 'admin' LIMIT 1;

    -- Получить id роли admin (или создать, если нет)
    SELECT id INTO v_role_id FROM roles WHERE code = 'admin' LIMIT 1;
    IF v_role_id IS NULL THEN
        INSERT INTO roles (id, code, name, created_at) VALUES (
            gen_random_uuid(),
            'admin',
            'Администратор',
            NOW()
        );
        SELECT id INTO v_role_id FROM roles WHERE code = 'admin' LIMIT 1;
    END IF;

    -- Назначить пользователю роль admin, если ещё не назначена
    IF NOT EXISTS (
        SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role_id = v_role_id
    ) THEN
        INSERT INTO user_roles (user_id, role_id, assigned_at)
        VALUES (v_user_id, v_role_id, NOW());
    END IF;
END $$;
