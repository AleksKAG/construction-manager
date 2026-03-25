FROM golang:1.23-alpine AS builder

# Устанавливаем необходимые пакеты для сборки
RUN apk add --no-cache git 

WORKDIR /app

# Копируем модули для кэширования
COPY go.mod go.sum ./
RUN go mod download

# Копируем исходный код
COPY . .

# Сборка с CGO_ENABLED=0 для статической линковки (важно для Alpine!)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o main ./cmd/api

# ========== Final stage ==========
FROM alpine:latest

# Добавляем корневые сертификаты и wget для healthcheck
RUN apk --no-cache add ca-certificates 

WORKDIR /app

# Копируем бинарник и статику
COPY --from=builder /app/main .
COPY --from=builder /app/web ./web

# Создаём директорию для БД с правильными правами
RUN mkdir -p /app/data 

EXPOSE 8080
CMD ["./main"]