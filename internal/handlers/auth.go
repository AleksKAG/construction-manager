package handlers

import (
	"net/http"
	"os"
	"time"

	"github.com/AleksKAG/construction-manager/internal/middleware"
	"github.com/gin-gonic/gin"
)

// IssueToken — выдаёт JWT по user_id + role (без проверки, для отладки / внутренних нужд).
func IssueToken() gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			UserID string `json:"user_id"`
			Role   string `json:"role"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if input.UserID == "" {
			input.UserID = "demo-user"
		}
		if input.Role == "" {
			input.Role = "admin"
		}
		token, err := middleware.GenerateToken(input.UserID, input.Role, 24*time.Hour)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"access_token": token, "token_type": "Bearer", "expires_in": 86400, "role": input.Role})
	}
}

// IssueServiceToken — выдаёт долгоживущий JWT для service-аккаунта.
// Проверяет SERVICE_API_KEY из env. Если не совпадает — 401.
// Токен живёт 365 дней.
func IssueServiceToken() gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			APIKey string `json:"api_key"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing api_key in body"})
			return
		}

		expected := os.Getenv("SERVICE_API_KEY")
		if expected == "" {
			expected = "dev-service-key"
		}
		if input.APIKey != expected {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid api_key"})
			return
		}

		token, err := middleware.GenerateToken("service-agent", "admin", 365*24*time.Hour)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"access_token": token,
			"token_type":   "Bearer",
			"expires_in":   365 * 24 * 3600,
			"user_id":      "service-agent",
			"role":         "admin",
		})
	}
}
