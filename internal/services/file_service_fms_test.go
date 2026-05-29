package services

import (
	"testing"
	"time"
)

func TestPresignedTTLCappedAt15Minutes(t *testing.T) {
	t.Setenv("S3_PREP_URL_TTL", "1h")
	if got := presignedTTL(); got != 15*time.Minute {
		t.Fatalf("expected TTL cap 15m, got %s", got)
	}
}

func TestPresignedTTLUsesConfiguredShorterValue(t *testing.T) {
	t.Setenv("S3_PREP_URL_TTL", "5m")
	if got := presignedTTL(); got != 5*time.Minute {
		t.Fatalf("expected configured TTL 5m, got %s", got)
	}
}

func TestSanitizeFileName(t *testing.T) {
	if got := sanitizeFileName(`../unsafe\\name.pdf`); got != "name.pdf" {
		t.Fatalf("expected safe basename, got %q", got)
	}
	if got := sanitizeFileName(" . "); got != "" {
		t.Fatalf("expected blank unsafe name, got %q", got)
	}
}
