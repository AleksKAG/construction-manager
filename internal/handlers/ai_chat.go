package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/AleksKAG/construction-manager/internal/services"
	"github.com/gin-gonic/gin"
)

type aiChatRequest struct {
	Message        string `json:"message" binding:"required"`
	Screenshot     string `json:"screenshot"`
	ScreenshotName string `json:"screenshot_name"`
	Context        struct {
		ProjectID   string `json:"project_id"`
		Route       string `json:"route"`
		SelectedDoc string `json:"selected_doc"`
	} `json:"context"`
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

		var req aiChatRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", toJSONLine(`{"message":"invalid request"}`))
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

		answer := buildFallbackAIAnswer(project.Name, project.Address, req)
		if services.YandexManagerEnabled() {
			systemPrompt := "Ты ИИ-ассистент строительного проекта. Отвечай кратко, структурировано и только на русском языке."
			userPrompt := fmt.Sprintf("Проект: %s. Адрес: %s. Маршрут: %s. Вопрос: %s", project.Name, project.Address, req.Context.Route, strings.TrimSpace(req.Message))
			if strings.TrimSpace(req.Screenshot) != "" {
				userPrompt += " Пользователь приложил снимок экрана. OCR в сервисе не включен: если данных недостаточно, попроси пользователя коротко описать ключевые фрагменты."
			}
			if llmAnswer, llmErr := services.AskYandexManager(c.Request.Context(), systemPrompt, userPrompt); llmErr == nil && strings.TrimSpace(llmAnswer) != "" {
				answer = llmAnswer
			} else if llmErr != nil {
				answer += "\n\nПримечание: ответ сформирован локально, так как Yandex AI Manager сейчас недоступен (" + llmErr.Error() + ")."
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
		fileName := defaultIfEmpty(strings.TrimSpace(req.ScreenshotName), "без имени")
		screenshotNote = "Снимок экрана приложен (" + fileName + "). OCR/распознавание в этом окружении не включены, поэтому укажите на скриншоте ключевые цифры/фрагменты текстом."
	}

	return fmt.Sprintf("Проект: %s (%s).\nМаршрут: %s.\nВопрос: %s\n\n%s\n\nРекомендация: уточните документ (ИРД/П/Р/Смета/Протокол), чтобы дать точный ответ по проектным данным.",
		projectName,
		address,
		defaultIfEmpty(req.Context.Route, "—"),
		strings.TrimSpace(req.Message),
		screenshotNote,
	)
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
