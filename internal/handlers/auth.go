package handlers

import (
	"net/http"
	"os"
	"time"

	"github.com/AleksKAG/construction-manager/internal/middleware"
	"github.com/gin-gonic/gin"
)

// IssueToken — demo-эндпоинт (оставлен для совместимости, не требует пароля).
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

// LoginInput — тело запроса /auth/login.
type LoginInput struct {
	Login    string `json:"login" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Login — проверяет логин/пароль из env AUTH_LOGIN / AUTH_PASSWORD и выдаёт JWT.
func Login() gin.HandlerFunc {
	return func(c *gin.Context) {
		var input LoginInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "login and password required"})
			return
		}

		expectedLogin := os.Getenv("AUTH_LOGIN")
		if expectedLogin == "" {
			expectedLogin = "admin"
		}
		expectedPassword := os.Getenv("AUTH_PASSWORD")
		if expectedPassword == "" {
			expectedPassword = "admin"
		}

		if input.Login != expectedLogin || input.Password != expectedPassword {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверный логин или пароль"})
			return
		}

		token, err := middleware.GenerateToken(input.Login, "admin", 24*time.Hour)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"access_token": token,
			"token_type":   "Bearer",
			"expires_in":   86400,
			"role":         "admin",
			"user_id":      input.Login,
		})
	}
}

// IssueServiceToken — выдаёт долгоживущий JWT для service-аккаунта по SERVICE_API_KEY.
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
