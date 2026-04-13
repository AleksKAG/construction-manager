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

type qwenMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type qwenRequest struct {
	Model    string        `json:"model"`
	Messages []qwenMessage `json:"messages"`
}

type yandexPrompt struct {
	ID        string            `json:"id"`
	Variables map[string]string `json:"variables,omitempty"`
}

type yandexResponsesRequest struct {
	Prompt yandexPrompt `json:"prompt"`
	Input  string       `json:"input"`
}

type qwenResponse struct {
	Choices []struct {
		Message qwenMessage `json:"message"`
	} `json:"choices"`
}

type yandexResponsesResponse struct {
	OutputText string `json:"output_text"`
}

func QwenEnabled() bool {
	return strings.TrimSpace(resolveAIKey()) != ""
}

func AskQwen(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	apiKey := strings.TrimSpace(resolveAIKey())
	if apiKey == "" {
		return "", fmt.Errorf("AI key is not set")
	}

	if strings.EqualFold(strings.TrimSpace(os.Getenv("AI_PROVIDER")), "yandex_manager") {
		return askYandexManager(ctx, apiKey, userPrompt)
	}

	baseURL := strings.TrimSpace(os.Getenv("QWEN_BASE_URL"))
	if baseURL == "" {
		baseURL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
	}
	model := strings.TrimSpace(os.Getenv("QWEN_MODEL"))
	if model == "" {
		model = "qwen-plus"
	}

	reqBody := qwenRequest{
		Model: model,
		Messages: []qwenMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
	}
	raw, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 25 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("qwen request failed: %s", strings.TrimSpace(string(body)))
	}

	var parsed qwenResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("empty qwen response")
	}
	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
}

func askYandexManager(ctx context.Context, apiKey, userPrompt string) (string, error) {
	baseURL := strings.TrimSpace(os.Getenv("YANDEX_BASE_URL"))
	if baseURL == "" {
		baseURL = "https://ai.api.cloud.yandex.net/v1"
	}
	promptID := strings.TrimSpace(os.Getenv("YANDEX_PROMPT_ID"))
	if promptID == "" {
		return "", fmt.Errorf("YANDEX_PROMPT_ID is not set")
	}
	folderID := strings.TrimSpace(os.Getenv("YANDEX_FOLDER_ID"))
	if folderID == "" {
		return "", fmt.Errorf("YANDEX_FOLDER_ID is not set")
	}

	reqBody := yandexResponsesRequest{
		Prompt: yandexPrompt{ID: promptID},
		Input:  userPrompt,
	}
	raw, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+"/responses", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Api-Key "+apiKey)
	req.Header.Set("OpenAI-Project", folderID)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 25 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("yandex manager request failed: %s", strings.TrimSpace(string(body)))
	}

	var parsed yandexResponsesResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if strings.TrimSpace(parsed.OutputText) == "" {
		return "", fmt.Errorf("empty yandex manager response")
	}
	return strings.TrimSpace(parsed.OutputText), nil
}

func resolveAIKey() string {
	if v := strings.TrimSpace(os.Getenv("YANDEX_API_KEY")); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv("QWEN_API_KEY"))
}
