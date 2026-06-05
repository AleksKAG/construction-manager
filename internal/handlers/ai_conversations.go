package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type aiConversationInput struct {
	ProjectID   string         `json:"project_id"`
	ProjectName string         `json:"project_name"`
	Title       string         `json:"title"`
	Metadata    models.JSONMap `json:"metadata"`
}

type aiMessageInput struct {
	Text     string         `json:"text" binding:"required"`
	Role     string         `json:"role"`
	Metadata models.JSONMap `json:"metadata"`
}

func ListAIConversations(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := currentUserID(c)
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}
		projectID := strings.TrimSpace(c.Query("project_id"))
		query := db.WithContext(c.Request.Context()).Where("user_id = ?", userID)
		if projectID != "" {
			query = query.Where("project_id = ?", projectID)
		}
		var rows []models.AIConversation
		if err := query.Order("updated_at DESC").Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": rows})
	}
}

func CreateAIConversation(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := currentUserID(c)
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}
		var input aiConversationInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		conv := models.AIConversation{
			UserID:      userID,
			ProjectID:   strings.TrimSpace(input.ProjectID),
			ProjectName: strings.TrimSpace(input.ProjectName),
			Title:       firstNonEmpty(strings.TrimSpace(input.Title), "Новая беседа"),
			Metadata:    input.Metadata,
		}
		if conv.ProjectName == "" && conv.ProjectID != "" {
			conv.ProjectName = lookupProjectObjectName(db, conv.ProjectID)
		}
		if err := db.WithContext(c.Request.Context()).Create(&conv).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, conv)
	}
}

func UpdateAIConversation(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := currentUserID(c)
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}
		var input aiConversationInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		updates := map[string]any{"updated_at": time.Now().UTC()}
		if strings.TrimSpace(input.Title) != "" {
			updates["title"] = strings.TrimSpace(input.Title)
		}
		if input.Metadata != nil {
			updates["metadata"] = input.Metadata
		}
		res := db.WithContext(c.Request.Context()).Model(&models.AIConversation{}).
			Where("id = ? AND user_id = ?", c.Param("id"), userID).
			Updates(updates)
		if res.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": res.Error.Error()})
			return
		}
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "conversation not found"})
			return
		}
		var conv models.AIConversation
		_ = db.WithContext(c.Request.Context()).First(&conv, "id = ? AND user_id = ?", c.Param("id"), userID).Error
		c.JSON(http.StatusOK, conv)
	}
}

func DeleteAIConversation(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := currentUserID(c)
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}
		res := db.WithContext(c.Request.Context()).Where("id = ? AND user_id = ?", c.Param("id"), userID).Delete(&models.AIConversation{})
		if res.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": res.Error.Error()})
			return
		}
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "conversation not found"})
			return
		}
		c.Status(http.StatusNoContent)
	}
}

func ListAIMessages(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := currentUserID(c)
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}
		if !conversationBelongsToUser(c.Request.Context(), db, c.Param("id"), userID) {
			c.JSON(http.StatusNotFound, gin.H{"error": "conversation not found"})
			return
		}
		var rows []models.AIMessage
		if err := db.WithContext(c.Request.Context()).Where("conversation_id = ? AND user_id = ?", c.Param("id"), userID).Order("created_at ASC").Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": rows})
	}
}

func CreateAIMessage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := currentUserID(c)
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}
		if !conversationBelongsToUser(c.Request.Context(), db, c.Param("id"), userID) {
			c.JSON(http.StatusNotFound, gin.H{"error": "conversation not found"})
			return
		}
		var input aiMessageInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		role := strings.TrimSpace(input.Role)
		if role == "" {
			role = "user"
		}
		msg := models.AIMessage{
			ConversationID: c.Param("id"),
			UserID:         userID,
			Role:           role,
			Text:           strings.TrimSpace(input.Text),
			Metadata:       input.Metadata,
		}
		if msg.Text == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "text is required"})
			return
		}
		if err := db.WithContext(c.Request.Context()).Create(&msg).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		_ = db.WithContext(c.Request.Context()).Model(&models.AIConversation{}).
			Where("id = ? AND user_id = ?", c.Param("id"), userID).
			Update("updated_at", time.Now().UTC()).Error
		c.JSON(http.StatusCreated, msg)
	}
}

func currentUserID(c *gin.Context) string {
	userID, _ := c.Get("user_id")
	return strings.TrimSpace(fmtAnyString(userID))
}

func lookupProjectObjectName(db *gorm.DB, projectID string) string {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" || db == nil {
		return ""
	}
	var name string
	_ = db.Table("project_objects").Select("name").Where("id = ?", projectID).Limit(1).Scan(&name).Error
	if strings.TrimSpace(name) != "" {
		return strings.TrimSpace(name)
	}
	_ = db.Table("projects").Select("name").Where("id = ?", projectID).Limit(1).Scan(&name).Error
	return strings.TrimSpace(name)
}

func conversationBelongsToUser(ctx context.Context, db *gorm.DB, conversationID, userID string) bool {
	var count int64
	if strings.TrimSpace(conversationID) == "" || strings.TrimSpace(userID) == "" {
		return false
	}
	if err := db.WithContext(ctx).Model(&models.AIConversation{}).
		Where("id = ? AND user_id = ?", conversationID, userID).
		Count(&count).Error; err != nil {
		return false
	}
	return count > 0
}

func fmtAnyString(value any) string {
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}
