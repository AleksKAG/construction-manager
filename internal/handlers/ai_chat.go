package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/AleksKAG/construction-manager/internal/services"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type aiChatRequest struct {
	Message        string `json:"message" binding:"required"`
	ConversationID string `json:"conversation_id"`
	Screenshot     string `json:"screenshot"`
	ScreenshotName string `json:"screenshot_name"`
	Context        struct {
		ProjectID   string `json:"project_id"`
		Route       string `json:"route"`
		SelectedDoc string `json:"selected_doc"`
	} `json:"context"`
}

func GetAIChatStream(repo repository.Repository, db *gorm.DB) gin.HandlerFunc {
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

		project, err := repo.GetProjectByIDLegacy(c.Request.Context(), projectID)
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
		if convID := strings.TrimSpace(req.ConversationID); convID != "" && db != nil {
			if userID := currentUserID(c); userID != "" && conversationBelongsToUser(c.Request.Context(), db, convID, userID) {
				_ = saveAIStreamMessages(c.Request.Context(), db, convID, userID, req, answer)
			}
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

func saveAIStreamMessages(ctx context.Context, db *gorm.DB, conversationID, userID string, req aiChatRequest, answer string) error {
	now := time.Now().UTC()
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		userMsg := models.AIMessage{
			ConversationID: conversationID,
			UserID:         userID,
			Role:           "user",
			Text:           strings.TrimSpace(req.Message),
			Metadata: models.JSONMap{
				"route":           req.Context.Route,
				"selected_doc":    req.Context.SelectedDoc,
				"screenshot_name": req.ScreenshotName,
				"has_screenshot":  strings.TrimSpace(req.Screenshot) != "",
			},
		}
		if err := tx.Create(&userMsg).Error; err != nil {
			return err
		}
		assistantMsg := models.AIMessage{
			ConversationID: conversationID,
			UserID:         userID,
			Role:           "assistant",
			Text:           strings.TrimSpace(answer),
			Metadata: models.JSONMap{
				"route": req.Context.Route,
			},
		}
		if err := tx.Create(&assistantMsg).Error; err != nil {
			return err
		}
		return tx.Model(&models.AIConversation{}).
			Where("id = ? AND user_id = ?", conversationID, userID).
			Updates(map[string]any{"updated_at": now}).Error
	})
}
