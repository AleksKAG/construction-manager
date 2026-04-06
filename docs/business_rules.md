# Business Rules

## ТЭП
1. **Общая площадь** = `area_above_ground + area_underground` для шаблонов с `calculation_method = sum`.
2. **Строительный объем** не может быть отрицательным.
3. Для `required = true` поле должно быть заполнено (число > 0 для числовых полей).
4. Для авторасчетных полей (`is_calculated = true`) значение приходит из формулы и не редактируется вручную.

## Документация и согласование
1. Статусы РД проходят цепочку: `draft → submitted → remarks → revised → approved → issued`.
2. Нельзя создать `doc_revisions` с тем же `rev_number` для одного `volume_id`.
3. Выпуск в производство (`is_issued_to_production = true`) разрешен только после `status = approved`.

## Графики
1. `planned_end >= planned_start`.
2. `actual_end >= actual_start`, если обе даты заполнены.
3. `progress_pct` всегда в диапазоне 0..100.
4. `deviation_days = actual_end - planned_end`.

## ИРД
1. Допустимые типы ИРД: `GPZU`, `TZ`, `MTZ`, `TU`.
2. Если заполнена `expiry_date`, то она должна быть не раньше `issue_date`.
3. Документ со статусом `expired` не должен использоваться как источник для новых значений ТЭП.
