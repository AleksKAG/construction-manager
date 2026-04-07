-- =============================================
-- SEED DATA для Construction Manager
-- Заполнение тестовыми проектами и данными
-- =============================================

PRAGMA foreign_keys = OFF;

-- ======================== TABLES (если БД ещё пустая) ========================
CREATE TABLE IF NOT EXISTS project_objects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    budget REAL,
    status TEXT DEFAULT 'planning',
    duration_days INTEGER DEFAULT 0,
    characteristics TEXT,
    cost_estimates TEXT,
    created_at DATETIME,
    updated_at DATETIME
);

CREATE TABLE IF NOT EXISTS gantt_tasks (
    id TEXT PRIMARY KEY,
    object_id TEXT,
    name TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    duration INTEGER,
    progress REAL DEFAULT 0,
    status TEXT
);

CREATE TABLE IF NOT EXISTS project_template_rows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    template_code TEXT NOT NULL,
    row_number INTEGER DEFAULT 1,
    values_json TEXT,
    created_by_user TEXT,
    created_at DATETIME,
    updated_at DATETIME
);

-- Очистка (раскомментируй при необходимости полного перезаполнения)
-- DELETE FROM project_template_rows;
-- DELETE FROM gantt_tasks;
-- DELETE FROM project_objects;

-- ======================== ПРОЕКТЫ ========================
INSERT INTO project_objects (id, name, address, budget, duration_days, status, characteristics, cost_estimates, created_at, updated_at)
VALUES
('proj-001', 'Жилой комплекс "Солнечный берег"', 'Москва, Новорижское ш., 25 км', 1245000000, 540, 'active', '{}', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('proj-002', 'Бизнес-центр "Технопарк"', 'Санкт-Петербург, Пулковское ш., 45', 685000000, 420, 'planning', '{}', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('proj-003', 'Логистический склад класса A', 'Краснодарский край, ст. Динская', 895000000, 380, 'active', '{}', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('proj-004', 'Жилой дом "Речной квартал"', 'Казань, ул. Портовая, 18', 452000000, 300, 'design', '{}', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO NOTHING;

-- ======================== ЗАДАЧИ GANTT ========================
INSERT INTO gantt_tasks (id, object_id, name, start_date, end_date, duration, progress, status)
VALUES
('task-001', 'proj-001', 'Подготовка территории и геология', '2026-01-10', '2026-02-28', 50, 100, 'завершено'),
('task-002', 'proj-001', 'Фундамент и нулевой цикл', '2026-03-01', '2026-06-15', 107, 65, 'смр'),
('task-003', 'proj-001', 'Возведение каркаса здания', '2026-06-20', '2026-11-30', 164, 15, 'смр'),
('task-004', 'proj-002', 'Разработка концепции и ПД', '2026-02-01', '2026-05-31', 120, 80, 'design'),
('task-005', 'proj-002', 'Раздел АР', '2026-03-10', '2026-06-20', 102, 45, 'проектирование'),
('task-006', 'proj-003', 'Земляные работы и фундаменты', '2026-04-01', '2026-07-15', 106, 40, 'смр'),
('task-007', 'proj-003', 'Монтаж металлоконструкций', '2026-07-20', '2026-10-30', 103, 10, 'construction'),
('task-008', 'proj-004', 'Эскизная стадия', '2026-01-20', '2026-03-15', 55, 90, 'design')
ON CONFLICT(id) DO NOTHING;

-- ======================== ШАБЛОННЫЕ ДАННЫЕ ========================
-- График проектирования для proj-001
INSERT INTO project_template_rows (id, project_id, template_code, row_number, values_json, created_by_user, created_at, updated_at)
VALUES
('row-ds-001', 'proj-001', 'design_schedule', 1, '{"volume_no":"1","code":"ПЗ","name":"Пояснительная записка","executor":"ООО ПроектСтрой","baseline_start":"2026-01-15","baseline_end":"2026-02-28","progress":"85"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('row-ds-002', 'proj-001', 'design_schedule', 2, '{"volume_no":"2","code":"СПОЗУ","name":"Схема планировочной организации","executor":"ООО ПроектСтрой","baseline_start":"2026-02-01","baseline_end":"2026-03-20","progress":"60"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('row-ds-003', 'proj-001', 'design_schedule', 3, '{"volume_no":"3","code":"АР","name":"Архитектурные решения","executor":"Архитектурная мастерская","baseline_start":"2026-03-01","baseline_end":"2026-05-15","progress":"30"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- ТЭП для proj-001
('row-tep-001', 'proj-001', 'tep', 1, '{"indicator":"Площадь земельного участка","unit":"га","amount":"2.45"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('row-tep-002', 'proj-001', 'tep', 2, '{"indicator":"Общая площадь здания","unit":"м²","amount":"14500"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('row-tep-003', 'proj-001', 'tep', 3, '{"indicator":"Количество этажей","unit":"шт","amount":"25"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- Сводный сметный расчёт для proj-001
('row-ssr-001', 'proj-001', 'summary_estimate', 1, '{"work_name":"Строительные работы","build_cost":"620000","install_cost":"120000","equip_cost":"85000","other_cost":"45000","total_cost":"870000"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('row-ssr-002', 'proj-001', 'summary_estimate', 2, '{"work_name":"Монтаж инженерных систем","build_cost":"0","install_cost":"185000","equip_cost":"95000","other_cost":"30000","total_cost":"310000"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- График СМР для proj-001
('row-smr-001', 'proj-001', 'smr_schedule', 1, '{"task_name":"Нулевой цикл","contractor":"Подрядчик А","progress":"65"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('row-smr-002', 'proj-001', 'smr_schedule', 2, '{"task_name":"Монтаж каркаса","contractor":"Подрядчик Б","progress":"15"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- Данные для proj-002
('row-ds-101', 'proj-002', 'design_schedule', 1, '{"volume_no":"1","code":"ПЗ","name":"Пояснительная записка","executor":"Бюро Север","baseline_start":"2026-02-10","baseline_end":"2026-03-30","progress":"70"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('row-tep-101', 'proj-002', 'tep', 1, '{"indicator":"Общая площадь БЦ","unit":"м²","amount":"9800"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

-- Данные для proj-003
('row-smr-101', 'proj-003', 'smr_schedule', 1, '{"task_name":"Фундаментная плита","contractor":"СкладСтрой","progress":"40"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('row-tep-201', 'proj-003', 'tep', 1, '{"indicator":"Площадь склада","unit":"м²","amount":"22000"}', 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO NOTHING;

PRAGMA journal_mode = WAL;
