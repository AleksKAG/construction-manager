package services

import "testing"

func TestExtractYandexManagerText_OutputText(t *testing.T) {
	body := []byte(`{"output_text":"Готово"}`)

	got, err := extractYandexManagerText(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "Готово" {
		t.Fatalf("unexpected text: %q", got)
	}
}

func TestExtractYandexManagerText_OutputArray(t *testing.T) {
	body := []byte(`{"output":[{"type":"message","content":[{"type":"output_text","text":"Ответ из output"}]}]}`)

	got, err := extractYandexManagerText(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "Ответ из output" {
		t.Fatalf("unexpected text: %q", got)
	}
}

func TestExtractYandexManagerText_ResultAlternatives(t *testing.T) {
	body := []byte(`{"result":{"alternatives":[{"message":{"text":"Ответ из alternatives"}}]}}`)

	got, err := extractYandexManagerText(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "Ответ из alternatives" {
		t.Fatalf("unexpected text: %q", got)
	}
}

func TestExtractYandexManagerText_Empty(t *testing.T) {
	body := []byte(`{"status":"ok"}`)

	_, err := extractYandexManagerText(body)
	if err == nil {
		t.Fatal("expected error")
	}
}
