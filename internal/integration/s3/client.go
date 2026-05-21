package s3

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"
)

type Client struct {
	endpoint  string
	bucket    string
	secretKey string
}

func NewClient() (*Client, error) {
	e := os.Getenv("S3_ENDPOINT")
	b := os.Getenv("S3_BUCKET")
	sk := os.Getenv("S3_SECRET_KEY")
	if e == "" || b == "" || sk == "" {
		return nil, fmt.Errorf("missing required S3 env vars")
	}
	return &Client{
		endpoint:  strings.TrimSuffix(e, "/"),
		bucket:    b,
		secretKey: sk,
	}, nil
}
func (c *Client) sign(key string, exp time.Time) string {
	mac := hmac.New(sha256.New, []byte(c.secretKey))
	mac.Write([]byte(key + exp.UTC().Format(time.RFC3339)))
	return hex.EncodeToString(mac.Sum(nil))
}
func (c *Client) GetPresignedPUTURL(_ context.Context, key, ct string, ttl time.Duration) (string, error) {
	exp := time.Now().Add(ttl)
	q := url.Values{"expires": []string{exp.UTC().Format(time.RFC3339)}, "content_type": []string{ct}, "signature": []string{c.sign(key, exp)}}
	return fmt.Sprintf("%s/%s/%s?%s", c.endpoint, c.bucket, key, q.Encode()), nil
}
func (c *Client) GetPresignedGETURL(_ context.Context, key string, ttl time.Duration) (string, error) {
	exp := time.Now().Add(ttl)
	q := url.Values{"expires": []string{exp.UTC().Format(time.RFC3339)}, "signature": []string{c.sign(key, exp)}}
	return fmt.Sprintf("%s/%s/%s?%s", c.endpoint, c.bucket, key, q.Encode()), nil
}
func (c *Client) VerifyObjectExists(context.Context, string) (bool, error) { return false, nil }
func (c *Client) DeleteObject(context.Context, string) error               { return nil }
