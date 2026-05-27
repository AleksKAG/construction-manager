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
		r = "ru-central-1"
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

// AWS Signature Version 4 implementation
func (c *Client) signV4(method, key, ct string, exp time.Time) (url.Values, error) {
	now := time.Now().UTC()
	dateStamp := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")

	escapedKey := strings.TrimPrefix(path.Clean("/"+key), "/")
	canonicalURI := "/" + url.PathEscape(c.bucket) + "/" + escapedKey

	query := url.Values{}
	query.Set("X-Amz-Algorithm", "AWS4-HMAC-SHA256")
	query.Set("X-Amz-Credential", c.accessKey+"/"+dateStamp+"/"+c.region+"/s3/aws4_request")
	query.Set("X-Amz-Date", amzDate)
	query.Set("X-Amz-Expires", fmt.Sprintf("%d", int(ttl.Seconds())))
	query.Set("X-Amz-SignedHeaders", "host")
	if ct != "" {
		query.Set("X-Amz-Content-Type", ct)
	}

	canonicalQueryString := query.Encode()

	host := strings.TrimPrefix(c.endpoint, "https://")
	host = strings.TrimPrefix(host, "http://")

	canonicalHeaders := "host:" + host + "\n"
	if ct != "" {
		canonicalHeaders += "x-amz-content-type:" + ct + "\n"
	}
	signedHeaders := "host"
	if ct != "" {
		signedHeaders += ";x-amz-content-type"
	}

	hashedPayload := "UNSIGNED-PAYLOAD"

	stringToSign := "AWS4-HMAC-SHA256\n"
	stringToSign += amzDate + "\n"
	stringToSign += dateStamp + "/" + c.region + "/s3/aws4_request\n"

	sha := sha256.New()
	sha.Write([]byte(canonicalHeaders + "\n" + signedHeaders + "\n" + hashedPayload))
	canonicalRequestHash := hex.EncodeToString(sha.Sum(nil))
	stringToSign += canonicalRequestHash

	signingKey := []byte("AWS4" + c.secretKey)
	for _, data := range [][]byte{[]byte(dateStamp), []byte(c.region), []byte("s3"), []byte("aws4_request")} {
		h := hmac.New(sha256.New, signingKey)
		h.Write(data)
		signingKey = h.Sum(nil)
	}

	mac := hmac.New(sha256.New, signingKey)
	mac.Write([]byte(stringToSign))
	signature := hex.EncodeToString(mac.Sum(nil))

	query.Set("X-Amz-Signature", signature)
	return query, nil
}

func (c *Client) objectURL(key string) string {
	escapedKey := strings.TrimPrefix(path.Clean("/"+key), "/")
	return fmt.Sprintf("%s/%s/%s", c.endpoint, url.PathEscape(c.bucket), escapedKey)
}

func (c *Client) GetPresignedPUTURL(_ context.Context, key, ct string, ttl time.Duration) (string, error) {
	if c.useAWSSigV4 && c.accessKey != "" {
		exp := time.Now().Add(ttl)
		query, err := c.signV4("PUT", key, ct, exp)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s?%s", c.objectURL(key), query.Encode()), nil
	}

	// Fallback to legacy format for backward compatibility
	exp := time.Now().Add(ttl)
	q := url.Values{"expires": []string{exp.UTC().Format(time.RFC3339)}, "content_type": []string{ct}, "signature": []string{c.signLegacy(key, exp)}}
	return fmt.Sprintf("%s?%s", c.objectURL(key), q.Encode()), nil
}

func (c *Client) GetPresignedGETURL(_ context.Context, key string, ttl time.Duration) (string, error) {
	if c.useAWSSigV4 && c.accessKey != "" {
		exp := time.Now().Add(ttl)
		query, err := c.signV4("GET", key, "", exp)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s?%s", c.objectURL(key), query.Encode()), nil
	}

	// Fallback to legacy format for backward compatibility
	exp := time.Now().Add(ttl)
	q := url.Values{"expires": []string{exp.UTC().Format(time.RFC3339)}, "signature": []string{c.signLegacy(key, exp)}}
	return fmt.Sprintf("%s?%s", c.objectURL(key), q.Encode()), nil
}

func (c *Client) signLegacy(key string, exp time.Time) string {
	mac := hmac.New(sha256.New, []byte(c.secretKey))
	mac.Write([]byte(key + exp.UTC().Format(time.RFC3339)))
	return hex.EncodeToString(mac.Sum(nil))
}

func (c *Client) VerifyObjectExists(context.Context, string) (bool, error) { return false, nil }
func (c *Client) DeleteObject(context.Context, string) error               { return nil }
