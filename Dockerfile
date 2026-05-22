FROM golang:1.25-alpine3.21 AS builder

RUN apk add --no-cache --virtual .build-deps git gcc musl-dev \
    && apk add --no-cache ca-certificates
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .


RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
    go build -a -installsuffix cgo -o main ./cmd/api

FROM alpine:3.21
RUN apk --no-cache add ca-certificates wget libgcc bash postgresql-client aws-cli
WORKDIR /app
COPY --from=builder /app/main .
COPY --from=builder /app/web ./web 
COPY --from=builder /app/schema ./schema
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
CMD ["./main"]
