FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git ca-certificates gcc musl-dev
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .


RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
    go build -a -installsuffix cgo -o main ./cmd/api

FROM alpine:latest
RUN apk --no-cache add ca-certificates wget libgcc
WORKDIR /app
COPY --from=builder /app/main .
COPY --from=builder /app/web ./web 
EXPOSE 8080
CMD ["./main"]