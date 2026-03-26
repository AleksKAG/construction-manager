# ========== Stage 1: Builder ==========
FROM golang:1.25-alpine AS builder

# Устанавливаем зависимости для сборки
RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Копируем модули для кэширования
COPY go.mod go.sum ./
RUN go mod download

# Копируем исходный код
COPY . .

# Сборка с CGO_ENABLED=0 (совместимо с modernc.org/sqlite)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -a -installsuffix cgo -o main ./cmd/api

# ========== Stage 2: Final image ==========
FROM alpine:latest

# Добавляем сертификаты и wget для healthcheck
RUN apk --no-cache add ca-certificates wget

WORKDIR /app

# Копируем бинарник и веб-файлы
COPY --from=builder /app/main .
COPY --from=builder /app/web ./web

# Создаём директорию для БД с правами на запись
RUN mkdir -p /tmp && chmod 777 /tmp

# Переменные окружения по умолчанию
ENV PORT=8080
ENV DB_PATH=/tmp/app.db
ENV GIN_MODE=release

EXPOSE 8080

# Healthcheck встроенный в Docker
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/api/v1/health || exit 1

CMD ["./main"]