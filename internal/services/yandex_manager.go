package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type yandexPrompt struct {
	ID        string            `json:"id"`
	Variables map[string]string `json:"variables,omitempty"`
}

type yandexResponseRequest struct {
	Prompt yandexPrompt `json:"prompt"`
	Input  string       `json:"input"`
}

type yandexManagerResponse struct {
	OutputText string `json:"output_text"`
}

func YandexManagerEnabled() bool {
	return strings.TrimSpace(os.Getenv("YANDEX_AI_API_KEY")) != "" &&
		strings.TrimSpace(os.Getenv("YANDEX_AI_FOLDER_ID")) != "" &&
		strings.TrimSpace(os.Getenv("YANDEX_AI_PROMPT_ID")) != ""
}

func AskYandexManager(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	apiKey := strings.TrimSpace(os.Getenv("YANDEX_AI_API_KEY"))
	if apiKey == "" {
		return "", fmt.Errorf("YANDEX_AI_API_KEY is not set")
	}
	folderID := strings.TrimSpace(os.Getenv("YANDEX_AI_FOLDER_ID"))
	if folderID == "" {
		return "", fmt.Errorf("YANDEX_AI_FOLDER_ID is not set")
	}
	promptID := strings.TrimSpace(os.Getenv("YANDEX_AI_PROMPT_ID"))
	if promptID == "" {
		return "", fmt.Errorf("YANDEX_AI_PROMPT_ID is not set")
	}

	endpoint := strings.TrimSpace(os.Getenv("YANDEX_AI_BASE_URL"))
	if endpoint == "" {
		endpoint = "https://ai.api.cloud.yandex.net/v1/responses"
	}

	reqBody := yandexResponseRequest{
		Prompt: yandexPrompt{ID: promptID},
		Input:  strings.TrimSpace(systemPrompt + "\n\n" + userPrompt),
	}
	raw, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Api-Key "+apiKey)
	req.Header.Set("OpenAI-Project", folderID)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 35 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("yandex manager request failed: %s", strings.TrimSpace(string(body)))
	}

	var parsed yandexManagerResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if strings.TrimSpace(parsed.OutputText) == "" {
		return "", fmt.Errorf("empty yandex manager response")
	}

	return strings.TrimSpace(parsed.OutputText), nil
}
