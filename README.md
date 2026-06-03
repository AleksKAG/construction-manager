# AI-система управления строительством
AI-система управления строительством — это интеллектуальное приложение на базе Go для автоматизации процессов в строительстве. Оно помогает управлять проектами, оптимизировать ресурсы и минимизировать риски. Проект разработан как pet-project для демонстрации.

<img width="1536" height="1024" alt="Мониторинг строительства в дополненной реальности" src="https://github.com/user-attachments/assets/596fe410-6c69-428a-be58-b0fea31c9019" />
<img width="1536" height="1024" alt="Проверка труб на строительном объекте" src="https://github.com/user-attachments/assets/e4c9bc4b-a15a-4a0a-82fb-b9852a0f7ba7" />

Возможности
- проектирование стадия П и Р: актуальный архив исходных данных, проектной и рабочей документации объекта
- дорожные карты и графики согласований документации, контроль и отслеживание устранения ошибок.
- Сметы: Автоматическое формирование и редактирование смет на основе вводных данных (проект).
- Графики: Построение Gantt-графиков для планирования этапов работ с учетом зависимостей. Анализ текущего производства работ с учетом количества людей и выработки, сравнение с графиком.
- Контроль ресурсов: Мониторинг запасов материалов, оборудования и персонала в реальном времени.
- Формирование необходимых документов для сдачи в эксплуатацию объекта, графики согласований строительных работ итд 
- Автоматический расчёт стоимости: Динамический расчет общей стоимости проекта с учетом инфляции и изменений цен.
- Мониторинг рисков: Анализ потенциальных рисков (погода, задержки поставок) с использованием простых ML-моделей для прогнозирования.

![image](https://github.com/user-attachments/assets/a8c36882-3b2f-488f-8006-97c514431c61)


 Архитектура
- Микросервисная архитектура: Разделена на модули (сметы, графики, ресурсы, риски), каждый как отдельный сервис в Go.
- Backend: Go с использованием Gin для API, GORM для ORM (база данных PostgreSQL).
- AI-компоненты: Интеграция с внешними API (например, TensorFlow Serving через gRPC) для расчета рисков и стоимости. Локальные модели на Gonum для простых вычислений.
- Frontend: Простой веб-интерфейс на HTML/JS 
- Хранение данных: PostgreSQL для структурированных данных, Redis для кэширования графиков.
- Развертывание: Docker для контейнеризации, Kubernetes для оркестрации в продакшене.

![Wow6w](https://github.com/user-attachments/assets/0ce081b5-5dfb-4e2f-aa21-7c4999170200)


 Инструменты и технологии
- Язык: Go 1.22+
- Фреймворки: Gin (HTTP), GORM (ORM), Gonum (математика/ML).
- Базы данных: PostgreSQL, Redis.
- AI/ML: Gonum для базовых моделей
- CI/CD: GitHub Actions.
- Тестирование: Go testing package, с покрытием >80%.
- Другие: Docker, Kubernetes, Prometheus для мониторинга, JWT для auth.

![wTuKd](https://github.com/user-attachments/assets/c7be690b-54f6-46cb-a4ae-621fa30dfe56)


 Установка
1. Клонировать репозиторий
[https://github.com/AleksKAG/AI-construction-manager.git](https://github.com/AleksKAG/AI-construction-manager.git)
cd AI-construction-manager
2. Настроить окружение
cp .env.example .env
Отредактировать .env: БД, Telegram токен, Yandex API ключи
3. Запустить через Docker Compose
docker-compose -f deployments/docker-compose.yml up --build
4. Или локально (требуется PostgreSQL)
go mod tidy
go run cmd/api/main.go
5. Примеры запросов
curl -X POST http://localhost:8080/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Жилой дом","address":"Москва, Ленина 10","budget":15000000}'

curl -X POST http://localhost:8080/api/v1/projects/1/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {"id":1, "name":"Земляные работы", "duration_days":5, "dependencies":[]},
      {"id":2, "name":"Фундамент", "duration_days":7, "dependencies":[1]},
      {"id":3, "name":"Стены", "duration_days":14, "dependencies":[2]}
    ]
  }'

curl -X POST http://localhost:8080/api/v1/projects/1/estimate \
  -H "Content-Type: application/json" \
  -d '{"tasks": [...]}'
  

## Что обновлено (S3 + документооборот)

В проекте добавлен production-ready контур документооборота:
- presigned upload (клиент загружает файл сразу в S3, backend не проксирует тело файла);
- подтверждение загрузки с фиксацией `storage_key` и SHA-256 (`file_hash`) в PostgreSQL;
- версионирование по `project_id + designation`;
- история изменений и отдельная таблица версий.

## Быстрый запуск

```bash
cp .env.example .env
go run ./cmd/api
```

Проверка:
```bash
curl http://localhost:8080/api/v1/health
```

## Обязательные env для документов/S3

```bash
# Auth/API
JWT_SECRET=change_me
SERVICE_API_KEY=change_me

# S3
S3_ENDPOINT=https://storage.teamweb.ru
S3_BUCKET=your-bucket
S3_SECRET_KEY=your-secret
S3_PREP_URL_TTL=1h
S3_GET_URL_TTL=24h

# Важно: для инициализации таблиц документов
RUN_DB_MIGRATIONS=true
```

> Если `RUN_DB_MIGRATIONS=false`, API всё равно выполняет безопасную проверку и создаёт `documents/document_versions/document_changes` при старте.

## Документные API

Все роуты находятся в защищённой группе `/api/v1/documents`:
- `POST /presigned-url`
- `POST /confirm`
- `GET /download`
- `POST /compare`

Пример запроса presigned URL:
```json
{
  "project_id": "cc82c3b2-992e-4f08-8da1-f35c2bd34755",
  "doc_type": "ird",
  "designation": "AR-001",
  "filename": "specification.pdf",
  "content_type": "application/pdf",
  "size": 73400320
}
```



## Автор
Квачёв Александр — Go-разработчик  
GitHub: [AleksKAG](https://github.com/AleksKAG)  
Telegram: [@Kurtalex27](https://t.me/Kurtalex27)
