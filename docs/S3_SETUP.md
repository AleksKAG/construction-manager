# Настройка S3 хранилища для резервных копий PostgreSQL

## Обзор

После миграции на PostgreSQL, S3 используется для хранения **резервных копий** базы данных (бэкапов), а не для хранения файла БД в реальном времени.

## Решение

Используем `pg_dump` для создания дампов PostgreSQL и выгрузки их в S3-хранилище Timeweb.

## Возможности

- **Автоматические бэкапы**: Периодическое создание дампов базы данных
- **Хранение в S3**: Все бэкапы сохраняются в облачном хранилище
- **Управление ретенцией**: Автоматическое удаление старых бэкапов
- **Latest бэкап**: Всегда доступна последняя версия для быстрого восстановления

## Файлы проекта

### 1. Новые файлы:
- `scripts/backup_postgres_to_s3.sh` - скрипт создания и выгрузки бэкапов в S3

### 2. Обновленные файлы:
- `Dockerfile` - добавлен aws-cli для работы с S3
- `docker-compose.yml` - добавлены переменные окружения для настройки бэкапов
- `.env.example` - шаблон переменных окружения для S3

## Инструкция по настройке

### Шаг 1: Настройте переменные окружения

Добавьте в файл `.env` следующие параметры:

```bash
# S3 Backup Configuration
S3_ENDPOINT=https://s3.twcstorage.ru
S3_BUCKET=your-bucket-name
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_REGION=ru-1

# Настройки бэкапов (опционально)
BACKUP_PREFIX=postgres_backup
UPLOAD_INTERVAL=86400          # 24 часа (в секундах)
RETENTION_DAYS=7               # Хранить бэкапы за 7 дней

# PostgreSQL connection (уже должны быть настроены)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=construction_manager
```

### Шаг 2: Включите автоматические бэкапы

В файле `docker-compose.yml` раскомментируйте строку entrypoint:

```yaml
services:
  construction-manager:
    # ... другие настройки ...
    
    # Включить автоматические бэкапы в S3
    entrypoint: ["/bin/sh", "-c", "/backup_postgres_to_s3.sh & exec /entrypoint.sh ./main"]
```

### Шаг 3: Перезапустите контейнер

```bash
docker-compose up -d --build
```

## Как это работает

### Создание бэкапа
1. Скрипт `backup_postgres_to_s3.sh` запускается в фоновом режиме
2. Выполняется `pg_dump` для создания дампа базы данных
3. Дамп сжимается через gzip
4. Файл загружается в S3 с именем вида `postgres_backup_YYYYMMDD_HHMMSS.sql.gz`

### Обновление latest бэкапа
- После каждого успешного бэкапа обновляется файл `postgres_backup_latest.sql.gz`
- Это позволяет быстро восстановить последнюю версию без поиска по дате

### Управление ретенцией
- Скрипт автоматически удаляет бэкапы старше `RETENTION_DAYS` дней
- Файл `latest` никогда не удаляется

### Расписание
- Первый бэкап создаётся сразу при запуске контейнера
- Последующие бэкапы создаются каждые `UPLOAD_INTERVAL` секунд (по умолчанию 24 часа)

## Ручное создание бэкапа

Для ручного создания бэкапа выполните команду:

```bash
docker exec construction-manager /backup_postgres_to_s3.sh
```

Или используйте pg_dump напрямую:

```bash
docker exec construction-manager pg_dump -h postgres -U postgres construction_manager | gzip > backup.sql.gz
```

## Восстановление из бэкапа

### Из latest бэкапа:
```bash
# Скачать бэкап из S3
aws s3 cp s3://your-bucket/postgres_backup/postgres_backup_latest.sql.gz . --endpoint-url https://s3.twcstorage.ru

# Восстановить базу
gunzip < postgres_backup_latest.sql.gz | psql -h localhost -U postgres -d construction_manager
```

### Из конкретного бэкапа по дате:
```bash
# Скачать нужный бэкап
aws s3 cp s3://your-bucket/postgres_backup/postgres_backup_20250101_120000.sql.gz . --endpoint-url https://s3.twcstorage.ru

# Восстановить базу
gunzip < postgres_backup_20250101_120000.sql.gz | psql -h localhost -U postgres -d construction_manager
```

## Переменные окружения

| Переменная | Описание | Значение по умолчанию |
|------------|----------|----------------------|
| S3_ENDPOINT | URL S3 сервиса | https://s3.twcstorage.ru |
| S3_BUCKET | Имя бакета | (требуется) |
| S3_ACCESS_KEY | Ключ доступа | (требуется) |
| S3_SECRET_KEY | Секретный ключ | (требуется) |
| S3_REGION | Регион | ru-1 |
| BACKUP_PREFIX | Префикс имени файлов бэкапов | postgres_backup |
| UPLOAD_INTERVAL | Интервал между бэкапами (секунды) | 86400 (24 часа) |
| RETENTION_DAYS | Срок хранения бэкапов (дни) | 7 |
| POSTGRES_HOST | Хост PostgreSQL | postgres |
| POSTGRES_PORT | Порт PostgreSQL | 5432 |
| POSTGRES_USER | Пользователь PostgreSQL | postgres |
| POSTGRES_PASSWORD | Пароль PostgreSQL | (требуется) |
| POSTGRES_DB | Имя базы данных | construction_manager |

## Важно!

- Файл `.env` с реальными ключами НЕ должен попадать в Git (он уже в `.gitignore`)
- Для продакшена используйте secrets management (Docker secrets, Vault и т.д.)
- Минимальный рекомендуемый интервал бэкапов: 1 час (3600 секунд)
- Для баз данных с высокой нагрузкой рассмотрите более частые бэкапы
- Проверяйте логи контейнера на предмет ошибок бэкапа

## Логи

Скрипт выводит подробную информацию о процессе бэкапа:
- Время начала/окончания бэкапа
- Имя созданного файла
- Статус загрузки в S3
- Информация об удалённых старых бэкапах

Просмотр логов:
```bash
docker logs construction-manager
```

## Отключение бэкапов

Если S3 не настроен (переменные не указаны), скрипт автоматически отключается без ошибок.

Для полного отключения закомментируйте entrypoint в `docker-compose.yml`.
