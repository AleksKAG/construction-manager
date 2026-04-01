# construction-manager

Go + Gin API для управления строительными объектами и задачами (Gantt), со встроенной SQLite базой.

## Быстрый запуск локально

### 1) Требования
- Go 1.22+ (рекомендуется)
- gcc / build-essential (нужен для `mattn/go-sqlite3`)

### 2) Переменные окружения (опционально)
Можно использовать `.env`:

```env
PORT=8080
DB_PATH=/tmp/construction_ai.db
```

По умолчанию:
- `PORT=8080`
- `DB_PATH=/tmp/construction_ai.db`

### 3) Запуск

```bash
go run ./cmd/api
```

Проверка:

```bash
curl http://localhost:8080/api/v1/health
```

Ожидаемый ответ: JSON со статусом `ok`.

---

## Проверка кода

```bash
go test ./...
```

В проекте пока нет unit-тестов, поэтому команда проверяет сборку пакетов и корректность зависимостей.

---

## Как запустить на Timeweb Cloud

Ниже самый простой вариант через Docker + Container Registry Timeweb Cloud.

### 1) Подготовьте Docker image

В корне уже есть `Dockerfile`.

Соберите образ локально:

```bash
docker build -t construction-manager:latest .
```

### 2) Загрузите образ в реестр Timeweb Cloud

1. Создайте Container Registry в Timeweb Cloud.
2. Получите адрес реестра и логин/токен.
3. Отправьте образ:

```bash
docker tag construction-manager:latest <registry>/<namespace>/construction-manager:latest
docker push <registry>/<namespace>/construction-manager:latest
```

### 3) Создайте контейнерный сервис

В панели Timeweb Cloud:
1. Создайте новый сервис/приложение из вашего образа.
2. Укажите порт контейнера: `8080`.
3. Добавьте переменные окружения:
   - `PORT=8080`
   - `DB_PATH=/data/construction_ai.db`
4. Смонтируйте постоянный volume в контейнер (например, `/data`), чтобы SQLite не терялась при перезапуске.

### 4) Проверьте доступность

После деплоя откройте:

```text
https://<ваш-домен>/api/v1/health
```

Если используется прокси/балансировщик, убедитесь, что он проксирует на порт `8080` контейнера.

---

## Что важно для продакшна

- SQLite подходит для небольших нагрузок и одного инстанса.
- Для нескольких реплик и высокой нагрузки лучше перейти на PostgreSQL.
- Добавьте мониторинг, ротацию логов и бэкапы volume.
