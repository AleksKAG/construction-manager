# AI-ассистент проекта: архитектура, RAG и внедрение

## 1) Архитектура взаимодействия

```mermaid
flowchart LR
    FE[React Frontend<br/>AI Widget] -->|POST /api/v1/ai/chat + SSE| BE[Go Backend (Gin)]

    subgraph BE_STEPS[Backend pipeline]
      AUTH[1. JWT + RBAC + project access check]
      CTX[2. Context extraction<br/>project_id, route, selected_doc]
      EMB[3. Query embedding generation]
      RAG[4. pgvector retrieval by project_id]
      PROMPT[5. Prompt assembly + safety filters]
      LLM[6. YandexGPT stream request]
      SSE[7. SSE stream to frontend]
    end

    BE --> AUTH --> CTX --> EMB --> RAG --> PROMPT --> LLM --> SSE

    PG[(PostgreSQL + pgvector)] --> RAG
    YC[YandexGPT + Embeddings API] --> LLM
    OBS[Prometheus/Logs<br/>prompt_hash, latency, status] --> BE
```

Ключевые принципы:
- YandexGPT не получает прямой доступ к БД.
- Каждый запрос ограничен `project_id`, полученным из авторизованного контекста.
- В prompt попадает только отфильтрованный и релевантный контент.

## 2) Подготовка БД и RAG-пайплайна

### 2.1. Включение pgvector

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2.2. Таблица векторных чанков

Используйте миграцию `schema/007_ai_rag.sql`.

```sql
CREATE TABLE IF NOT EXISTS ai_document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    source_table VARCHAR(64) NOT NULL,
    source_id UUID,
    source_title TEXT,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1024) NOT NULL,
    token_count INT DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chunks_project_source
  ON ai_document_chunks(project_id, source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_ai_chunks_embedding_hnsw
  ON ai_document_chunks USING hnsw (embedding vector_cosine_ops);
```

### 2.3. Первичное заполнение чанков

Добавлен скрипт `scripts/embed_existing_data.go`:
- читает данные из `ird`, `stage_p`, `stage_r`, `estimates`, `protocols`;
- делает чанкинг ~500 слов c overlap;
- вызывает embedding API;
- пишет в `ai_document_chunks` батчами.

Запуск:

```bash
go run scripts/embed_existing_data.go
```

## 3) Бэкенд (Gin + YandexGPT + SSE)

Рекомендуемые компоненты:

- `internal/ai/yandex_client.go`
  - `ChatStream(ctx, messages)` для токен-стрима;
  - `GetEmbedding(ctx, text)` для эмбеддингов.
- `internal/repository/vector.go`
  - `FindRelevantChunks(ctx, projectID, embedding, limit)`;
  - SQL с `1 - (embedding <=> ?) as similarity`.
- `internal/handlers/ai_chat.go`
  - POST запрос с JSON телом;
  - JWT/RBAC + проверка доступа к `project_id`;
  - санитизация и сбор контекста;
  - SSE ответ `event: token` / `event: done` / `event: error`.

Минимальный формат события SSE:

```text
event: token
data: {"text":"..."}

event: done
data: {"status":"ok"}
```

## 4) Фронтенд-виджет (React)

Рекомендуемый `AIAssistantWidget`:
- сворачиваемый fixed-виджет справа снизу;
- знает `projectId` из URL и `route` из `useLocation()`;
- отправляет POST на `/api/v1/ai/chat`;
- читает `ReadableStream`, парсит SSE события, рисует потоковый ответ;
- состояния: `idle/loading/error`, retry, auto-scroll.

Интеграция: вставить компонент в `MainLayout` рядом с `<Outlet />`.

## 5) Yandex Cloud и переменные окружения

Добавьте в `.env`:

```env
YANDEX_AI_API_KEY=your_api_key_here
YANDEX_AI_MODEL=yandexgpt-lite
YANDEX_EMBEDDING_MODEL=text-search-query
AI_RATE_LIMIT=5
AI_MAX_CONTEXT_CHUNKS=5
AI_MAX_INPUT_CHARS=4000
```

## 6) Безопасность и деплой

Обязательные пункты:
- rate limiting на пользователя (или JWT `sub` + IP fallback);
- regex-санитизация персональных данных перед отправкой в LLM;
- логирование технических метрик без сырого prompt (только hash);
- таймауты на upstream запросы в LLM/Embedding API;
- circuit breaker/fallback при деградации внешнего API.

Для TeamWeb:
1. Добавить секреты окружения (`YANDEX_AI_API_KEY` и др.).
2. Проверить, что миграция `007_ai_rag.sql` применяется при старте.
3. Проверить доступность SSE через ingress/reverse proxy (`proxy_buffering off` для stream).

## 7) Чек-лист запуска

- [ ] `pgvector` установлен, `ai_document_chunks` создана
- [ ] импортер `go run scripts/embed_existing_data.go` выполнен
- [ ] `.env` содержит ключ и модели Yandex
- [ ] endpoint `/api/v1/ai/chat` доступен и стримит SSE
- [ ] React-виджет подключен в layout
- [ ] включены rate-limit и санитизация
- [ ] мониторинг latency/error-rate настроен
