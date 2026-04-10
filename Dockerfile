FROM golang:1.23-alpine3.21 AS builder

RUN apk add --no-cache --virtual .build-deps git gcc musl-dev \
    && apk add --no-cache ca-certificates
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .


RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
    go build -a -installsuffix cgo -o main ./cmd/api

FROM alpine:3.21
ARG INSTALL_AWSCLI=true
RUN apk --no-cache add ca-certificates wget libgcc bash sqlite \
    && if [ "$INSTALL_AWSCLI" = "true" ]; then apk --no-cache add aws-cli; fi
WORKDIR /app
COPY --from=builder /app/main .
COPY --from=builder /app/web ./web 
COPY entrypoint.sh /entrypoint.sh
COPY scripts/sync_db_to_s3.sh /sync_db_to_s3.sh
RUN chmod +x /entrypoint.sh /sync_db_to_s3.sh
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
CMD ["./main"]
