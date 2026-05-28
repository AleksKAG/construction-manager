package s3

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"path"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	awss3 "github.com/aws/aws-sdk-go/service/s3"
)

type Client struct {
	endpoint    string
	bucket      string
	accessKey   string
	secretKey   string
	region      string
	useAWSSigV4 bool
}

func NewClient() (*Client, error) {
	e := os.Getenv("S3_ENDPOINT")
	b := os.Getenv("S3_BUCKET")
	ak := os.Getenv("S3_ACCESS_KEY")
	sk := os.Getenv("S3_SECRET_KEY")
	r := os.Getenv("S3_REGION")
	if e == "" || b == "" || sk == "" {
		return nil, fmt.Errorf("missing required S3 env vars")
	}
	if r == "" {
		r = "ru-1"
	}
	c := &Client{
		endpoint:    strings.TrimSuffix(e, "/"),
		bucket:      b,
		accessKey:   ak,
		secretKey:   sk,
		region:      r,
		useAWSSigV4: true,
	}
	if ak == "" {
		c.useAWSSigV4 = false
	}
	return c, nil
}

func (c *Client) newAWSSession() (*session.Session, error) {
	return session.NewSession(&aws.Config{
		Endpoint:         aws.String(c.endpoint),
		Region:           aws.String(c.region),
		S3ForcePathStyle: aws.Bool(true),
		Credentials: credentials.NewStaticCredentials(
			c.accessKey,
			c.secretKey,
			"",
		),
	})
}

func (c *Client) signV4PUT(key, ct string, ttl time.Duration) (string, error) {
	sess, err := c.newAWSSession()
	if err != nil {
		return "", fmt.Errorf("s3 session: %w", err)
	}
	svc := awss3.New(sess)
	req, _ := svc.PutObjectRequest(&awss3.PutObjectInput{
		Bucket:      aws.String(c.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(ct),
	})
	urlStr, err := req.Presign(ttl)
	if err != nil {
		return "", fmt.Errorf("presign PUT: %w", err)
	}
	return urlStr, nil
}

func (c *Client) signV4GET(key string, ttl time.Duration) (string, error) {
	sess, err := c.newAWSSession()
	if err != nil {
		return "", fmt.Errorf("s3 session: %w", err)
	}
	svc := awss3.New(sess)
	req, _ := svc.GetObjectRequest(&awss3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	urlStr, err := req.Presign(ttl)
	if err != nil {
		return "", fmt.Errorf("presign GET: %w", err)
	}
	return urlStr, nil
}

func (c *Client) objectURL(key string) string {
	escapedKey := strings.TrimPrefix(path.Clean("/"+key), "/")
	return fmt.Sprintf("%s/%s/%s", c.endpoint, url.PathEscape(c.bucket), escapedKey)
}

func (c *Client) GetPresignedPUTURL(_ context.Context, key, ct string, ttl time.Duration) (string, error) {
	if c.useAWSSigV4 && c.accessKey != "" {
		return c.signV4PUT(key, ct, ttl)
	}

	// Fallback to legacy format for backward compatibility
	exp := time.Now().Add(ttl)
	q := url.Values{
		"expires":      []string{exp.UTC().Format(time.RFC3339)},
		"content_type": []string{ct},
		"signature":    []string{c.signLegacy(key, exp)},
	}
	return fmt.Sprintf("%s?%s", c.objectURL(key), q.Encode()), nil
}

func (c *Client) GetPresignedGETURL(_ context.Context, key string, ttl time.Duration) (string, error) {
	if c.useAWSSigV4 && c.accessKey != "" {
		return c.signV4GET(key, ttl)
	}

	// Fallback to legacy format for backward compatibility
	exp := time.Now().Add(ttl)
	q := url.Values{
		"expires":   []string{exp.UTC().Format(time.RFC3339)},
		"signature": []string{c.signLegacy(key, exp)},
	}
	return fmt.Sprintf("%s?%s", c.objectURL(key), q.Encode()), nil
}

func (c *Client) signLegacy(key string, exp time.Time) string {
	mac := hmac.New(sha256.New, []byte(c.secretKey))
	mac.Write([]byte(key + exp.UTC().Format(time.RFC3339)))
	return hex.EncodeToString(mac.Sum(nil))
}

func (c *Client) VerifyObjectExists(context.Context, string) (bool, error) { return false, nil }
func (c *Client) DeleteObject(context.Context, string) error               { return nil }

// MoveObject копирует объект из srcKey в dstKey и удаляет исходный.
// Используется для переноса временных файлов в постоянное хранилище.
func (c *Client) MoveObject(_ context.Context, srcKey, dstKey string) error {
	if !c.useAWSSigV4 || c.accessKey == "" {
		return nil // заглушка: в legacy-режиме просто пропускаем
	}
	sess, err := c.newAWSSession()
	if err != nil {
		return fmt.Errorf("s3 session: %w", err)
	}
	svc := awss3.New(sess)
	copySource := url.PathEscape(c.bucket+"/"+srcKey)
	_, err = svc.CopyObject(&awss3.CopyObjectInput{
		Bucket:     aws.String(c.bucket),
		CopySource: aws.String(copySource),
		Key:        aws.String(dstKey),
	})
	if err != nil {
		return fmt.Errorf("s3 copy: %w", err)
	}
	_, err = svc.DeleteObject(&awss3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(srcKey),
	})
	if err != nil {
		return fmt.Errorf("s3 delete src: %w", err)
	}
	return nil
}
