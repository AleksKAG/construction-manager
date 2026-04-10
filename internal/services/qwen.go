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

type qwenResponse struct {
	Choices []struct {
		Message qwenMessage `json:"message"`
	} `json:"choices"`
}

func QwenEnabled() bool {
	return strings.TrimSpace(os.Getenv("QWEN_API_KEY")) != ""
}

func AskQwen(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	apiKey := strings.TrimSpace(os.Getenv("QWEN_API_KEY"))
	if apiKey == "" {
		return "", fmt.Errorf("QWEN_API_KEY is not set")
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
