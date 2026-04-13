package handlers

import (
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/AleksKAG/construction-manager/internal/services"
	"github.com/gin-gonic/gin"
)

const (
	defaultAIRateLimit = 5
	maxInputChars      = 4000
	maxScreenshotChars = 1_500_000
)

type aiChatRequest struct {
	Message    string `json:"message" binding:"required"`
	Screenshot string `json:"screenshot"`
	Context    struct {
		ProjectID   string `json:"project_id"`
		Route       string `json:"route"`
		SelectedDoc string `json:"selected_doc"`
	} `json:"context"`
}

type slidingLimiter struct {
	mu      sync.Mutex
	entries map[string][]time.Time
}

var aiLimiter = &slidingLimiter{entries: map[string][]time.Time{}}

func (l *slidingLimiter) allow(key string, limit int, window time.Duration) bool {
	now := time.Now()
	cutoff := now.Add(-window)

	l.mu.Lock()
	defer l.mu.Unlock()

	hits := l.entries[key]
	filtered := hits[:0]
	for _, ts := range hits {
		if ts.After(cutoff) {
			filtered = append(filtered, ts)
		}
	}
	if len(filtered) >= limit {
		l.entries[key] = filtered
		return false
	}
	l.entries[key] = append(filtered, now)
	return true
}

func GetAIChatStream(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Content-Type", "text/event-stream")
		c.Writer.Header().Set("Cache-Control", "no-cache")
		c.Writer.Header().Set("Connection", "keep-alive")
		c.Writer.Header().Set("X-Accel-Buffering", "no")

		flusher, ok := c.Writer.(http.Flusher)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "stream unsupported"})
			return
		}

		rateLimit := readIntEnv("AI_RATE_LIMIT", defaultAIRateLimit)
		userKey := strings.TrimSpace(c.GetString("user_id"))
		if userKey == "" {
			userKey = "ip:" + c.ClientIP()
		}
		if !aiLimiter.allow(userKey, rateLimit, time.Minute) {
			fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", toJSONLine(`{"message":"rate limit exceeded"}`))
			flusher.Flush()
			return
		}

		var req aiChatRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", toJSONLine(`{"message":"invalid request"}`))
			flusher.Flush()
			return
		}

		if len(req.Screenshot) > maxScreenshotChars {
			fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", toJSONLine(`{"message":"screenshot is too large"}`))
			flusher.Flush()
			return
		}

		projectID := strings.TrimSpace(req.Context.ProjectID)
		if projectID == "" {
			fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", toJSONLine(`{"message":"project_id is required"}`))
			flusher.Flush()
			return
		}

		project, err := repo.GetProjectByID(c.Request.Context(), projectID)
		if err != nil {
			fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", toJSONLine(`{"message":"project not found"}`))
			flusher.Flush()
			return
		}

		safeMessage := sanitizePII(strings.TrimSpace(req.Message))
		if safeMessage == "" {
			safeMessage = "Пустой запрос"
		}
		if len([]rune(safeMessage)) > maxInputChars {
			runes := []rune(safeMessage)
			safeMessage = string(runes[:maxInputChars])
		}
		req.Message = safeMessage
		req.Context.Route = sanitizePII(strings.TrimSpace(req.Context.Route))
		req.Context.SelectedDoc = sanitizePII(strings.TrimSpace(req.Context.SelectedDoc))

		answer := buildFallbackAIAnswer(project.Name, project.Address, req)
		if services.QwenEnabled() {
			systemPrompt := "Ты ИИ-ассистент строительного проекта. Отвечай кратко, структурировано и только на русском языке."
			userPrompt := fmt.Sprintf("Проект: %s. Адрес: %s. Маршрут: %s. Документ: %s. Вопрос: %s", project.Name, project.Address, req.Context.Route, req.Context.SelectedDoc, req.Message)
		answer := buildFallbackAIAnswer(project.Name, project.Address, req)
		if services.QwenEnabled() {
			systemPrompt := "Ты ИИ-ассистент строительного проекта. Отвечай кратко, структурировано и только на русском языке."
			userPrompt := fmt.Sprintf("Проект: %s. Адрес: %s. Маршрут: %s. Вопрос: %s", project.Name, project.Address, req.Context.Route, strings.TrimSpace(req.Message))
			if strings.TrimSpace(req.Screenshot) != "" {
				userPrompt += " Пользователь приложил снимок экрана (base64), но OCR недоступен: попроси кратко описать важные фрагменты снимка."
			}
			if llmAnswer, qErr := services.AskQwen(c.Request.Context(), systemPrompt, userPrompt); qErr == nil && strings.TrimSpace(llmAnswer) != "" {
				answer = llmAnswer
			}
		}

		for _, token := range strings.Fields(answer) {
			fmt.Fprintf(c.Writer, "event: token\ndata: %s\n\n", toJSONLine(fmt.Sprintf(`{"text":"%s "}`, escapeJSON(token))))
			flusher.Flush()
			time.Sleep(12 * time.Millisecond)
		}
		fmt.Fprint(c.Writer, "event: done\ndata: {\"status\":\"ok\"}\n\n")
		flusher.Flush()
	}
}

func buildFallbackAIAnswer(projectName, address string, req aiChatRequest) string {
	screenshotNote := "Снимок экрана не приложен."
	if strings.TrimSpace(req.Screenshot) != "" {
		screenshotNote = "Снимок экрана приложен. OCR/распознавание в этом окружении не включены, поэтому укажите на скриншоте ключевые цифры/фрагменты текстом."
	}

	return fmt.Sprintf("Проект: %s (%s).\nМаршрут: %s.\nДокумент: %s.\nВопрос: %s\n\n%s\n\nРекомендация: уточните документ (ИРД/П/Р/Смета/Протокол), чтобы дать точный ответ по проектным данным.",
		projectName,
		address,
		defaultIfEmpty(req.Context.Route, "—"),
		defaultIfEmpty(req.Context.SelectedDoc, "—"),
		req.Message,
	return fmt.Sprintf("Проект: %s (%s).\nМаршрут: %s.\nВопрос: %s\n\n%s\n\nРекомендация: уточните документ (ИРД/П/Р/Смета/Протокол), чтобы дать точный ответ по проектным данным.",
		projectName,
		address,
		defaultIfEmpty(req.Context.Route, "—"),
		strings.TrimSpace(req.Message),
		screenshotNote,
	)
}

var (
	reEmail    = regexp.MustCompile(`(?i)\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b`)
	rePhone    = regexp.MustCompile(`\+?\d[\d\s\-()]{8,}\d`)
	reINN      = regexp.MustCompile(`\b\d{10}|\d{12}\b`)
	reContract = regexp.MustCompile(`(?i)\b(договор|контракт)\s*№?\s*[A-ZА-Я0-9\-\/]+`)
)

func sanitizePII(s string) string {
	s = reEmail.ReplaceAllString(s, "[EMAIL]")
	s = rePhone.ReplaceAllString(s, "[PHONE]")
	s = reINN.ReplaceAllString(s, "[INN]")
	s = reContract.ReplaceAllString(s, "[CONTRACT]")
	return strings.TrimSpace(s)
}

func readIntEnv(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}

func toJSONLine(raw string) string {
	return strings.ReplaceAll(raw, "\n", "")
}

func escapeJSON(s string) string {
	r := strings.NewReplacer("\\", "\\\\", `"`, `\\"`, "\n", " ", "\r", " ")
	return r.Replace(s)
}

func defaultIfEmpty(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}
