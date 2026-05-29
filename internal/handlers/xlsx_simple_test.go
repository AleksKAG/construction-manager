package handlers

import (
	"bytes"
	"testing"
)

func TestSimpleXLSXRoundTrip(t *testing.T) {
	headers := []string{"№", "Стадия П", "Наименование"}
	rows := [][]string{
		{"1", "АР", "Лист А-01"},
		{"2", "КР", "Лист К-07"},
	}
	data, err := buildSimpleXLSX(headers, rows)
	if err != nil {
		t.Fatalf("buildSimpleXLSX error: %v", err)
	}
	parsed, err := parseSimpleXLSX(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("parseSimpleXLSX error: %v", err)
	}
	if len(parsed) != 3 {
		t.Fatalf("expected 3 rows with header, got %d", len(parsed))
	}
	if parsed[0][1] != "Стадия П" {
		t.Fatalf("unexpected header value: %q", parsed[0][1])
	}
	if parsed[2][2] != "Лист К-07" {
		t.Fatalf("unexpected row value: %q", parsed[2][2])
	}
}

func TestBuildSimplePDF(t *testing.T) {
	data := buildSimplePDF([]string{"Dashboard", "Project: Test"})
	if !bytes.HasPrefix(data, []byte("%PDF-1.4")) {
		t.Fatalf("expected PDF header, got %q", data[:8])
	}
	if !bytes.Contains(data, []byte("Project: Test")) {
		t.Fatal("expected PDF content to include project line")
	}
}
