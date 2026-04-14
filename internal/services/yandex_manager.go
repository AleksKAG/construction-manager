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
	Output     []struct {
		Type    string `json:"type"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"output"`
	Result struct {
		Alternatives []struct {
			Message struct {
				Text string `json:"text"`
			} `json:"message"`
		} `json:"alternatives"`
	} `json:"result"`
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

	answer, err := extractYandexManagerText(body)
	if err != nil {
		return "", err
	}
	return answer, nil
}

func extractYandexManagerText(body []byte) (string, error) {
	var parsed yandexManagerResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}

	if text := strings.TrimSpace(parsed.OutputText); text != "" {
		return text, nil
	}

	for _, item := range parsed.Output {
		for _, part := range item.Content {
			if strings.TrimSpace(part.Text) != "" {
				return strings.TrimSpace(part.Text), nil
			}
		}
	}

	for _, alt := range parsed.Result.Alternatives {
		if text := strings.TrimSpace(alt.Message.Text); text != "" {
			return text, nil
		}
	}

	return "", fmt.Errorf("empty yandex manager response")
}
