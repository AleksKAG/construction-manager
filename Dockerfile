FROM golang:1.25-alpine AS builder

# Устанавливаем необходимые пакеты для сборки
RUN apk add --no-cache git ca-certificates

WORKDIR /app
COPY .env .env
# Копируем модули для кэширования
COPY go.mod go.sum ./
RUN go mod download

# Копируем исходный код
COPY . .

# Сборка с CGO_ENABLED=0 для статической линковки (важно для Alpine!)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -a -installsuffix cgo -o main ./cmd/api

# ========== Final stage ==========
FROM alpine:latest

# Добавляем корневые сертификаты и wget для healthcheck
RUN apk --no-cache add ca-certificates wget

WORKDIR /app

# Копируем бинарник и статику
COPY --from=builder /app/main .
COPY --from=builder /app/web ./web

# Создаём директорию для БД с правильными правами
RUN mkdir -p /app/data && chmod 777 /app/data

# Создаём не-root пользователя для безопасности (опционально, но рекомендуется)
# RUN adduser -D -u 1000 appuser && chown -R appuser /app
# USER appuser

EXPOSE 8080

# Healthcheck встроенный в Docker (альтернатива compose healthcheck)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/api/v1/health || exit 1

CMD ["./main"]