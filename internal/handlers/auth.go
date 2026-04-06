package handlers

import (
	"net/http"
	"time"

	"github.com/AleksKAG/construction-manager/internal/middleware"
	"github.com/gin-gonic/gin"
)

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
