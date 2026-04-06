# Data Dictionary

## `tep_templates`
- `code` — системный код шаблона (`building_main`, `pensionat`, `site`).
- `name` — человекочитаемое название шаблона.
- `category` — категория (`main_object`, `auxiliary`, `land`).
- `is_active` — признак доступности шаблона в UI.

## `tep_indicators`
- `key` — уникальный ключ индикатора внутри шаблона.
- `label` — подпись поля в интерфейсе.
- `unit` — единица измерения (`м²`, `м³`, `м`, `этаж`, `шт.`).
- `required` — обязательность ввода.
- `calculation_method` — `manual`, `sum`, `max`.
- `parent_key` — ключ родительского показателя для вложенных индикаторов.
- `metadata` — произвольные дополнительные настройки (`has_underground`, `formula`).

## `project_tep_values`
- `project_id` — ссылка на объект проекта (`project_objects.id`).
- `template_code` — код примененного шаблона.
- `indicator_key` — ключ показателя из `tep_indicators`.
- `value_numeric` — числовое значение.
- `value_text` — текстовое значение (если требуется).
- `unit_override` — переопределение единицы измерения.
- `is_calculated` — признак авторасчета (`true`) vs ручного ввода (`false`).

## `ssr_chapters` / `ssr_items`
- `chapter_number` — номер главы ССР (1..12).
- `is_summary` — строка/глава является итоговой.
- `total_cost` — вычисляемая сумма затрат по статье.

## `schedule_tasks`
- `task_type` — тип графика: `design` или `construction`.
- `wbs_code` — код в иерархии WBS.
- `parent_task_id` — связь задач по дереву.
- `progress_pct` — процент выполнения (0..100).
- `deviation_days` — вычисляемое отклонение от планового окончания.

## `doc_sections` / `doc_volumes` / `doc_revisions`
- `doc_sections.parent_id` — хранение иерархии разделов через adjacency list.
- `doc_volumes.stage` — стадия (`P`/`RD`).
- `doc_revisions.rev_number` — номер изменения (Изм 1, Изм 2...).
- `doc_revisions.file_path` — путь к приложенному PDF изменения.
