FROM golang:1.25-alpine AS builder

WORKDIR /app

# Устанавливаем необходимые пакеты для CGO + SQLite
RUN apk add --no-cache \
    gcc \
    musl-dev \
    sqlite-dev

# Кэшируем зависимости
COPY go.mod go.sum ./
RUN go mod download

# Копируем весь код
COPY . .

# Собираем с CGO_ENABLED=1
RUN CGO_ENABLED=1 GOOS=linux go build -x /construction-manager ./cmd/api/main.go

# Финальный образ
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata sqlite-libs

WORKDIR /root/

# Копируем бинарник
COPY --from=builder /construction-manager .

# Копируем веб-файлы и миграции (если есть)
COPY web/ ./web/
COPY migrations/ ./migrations/

# Создаём папку для базы данных SQLite 
RUN mkdir -p /data

EXPOSE 8080

# Запуск
CMD ["./main"]
