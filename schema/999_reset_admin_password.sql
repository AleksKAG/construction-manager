-- 999_reset_admin_password.sql
-- Сбросить пароль администратора на 'admin' (bcrypt $2a$12$t0THJ3lKmG7o90IYbR5U4eHIYaNfJ1knKf73K5kGeSejS5DwObX2u)

UPDATE users
SET password_hash = '$2a$12$t0THJ3lKmG7o90IYbR5U4eHIYaNfJ1knKf73K5kGeSejS5DwObX2u'
WHERE LOWER(username) = 'admin' OR LOWER(email) = 'admin';
