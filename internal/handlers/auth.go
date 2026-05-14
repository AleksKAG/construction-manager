package handlers

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/middleware"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// IssueToken — service/demo endpoint guarded by SERVICE_API_KEY.
func IssueToken() gin.HandlerFunc {
	return issueServiceTokenHandler()
}

// LoginInput — тело запроса /auth/login.
type LoginInput struct {
	Login    string `json:"login" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type authUserDTO struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	Role      string    `json:"role"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type authUserRecord struct {
	ID           string
	Username     string
	Email        string
	FullName     string
	PasswordHash string
	Role         string
	IsActive     bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Login — проверяет логин/пароль пользователя из БД и выдаёт JWT.
func Login(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input LoginInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "login and password required"})
			return
		}

		user, err := findAuthUser(db, strings.TrimSpace(input.Login))
		if err != nil || user.ID == "" || !user.IsActive || bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)) != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Неверный логин или пароль"})
			return
		}

		role := normalizeRole(user.Role)
		token, err := middleware.GenerateToken(user.ID, role, 24*time.Hour)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"access_token": token,
			"token_type":   "Bearer",
			"expires_in":   86400,
			"role":         role,
			"user_id":      user.ID,
			"username":     user.Username,
			"full_name":    user.FullName,
		})
	}
}

func CurrentUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("user_id")
		userIDString, _ := userID.(string)
		user, err := findAuthUserByID(db, userIDString)
		if err != nil || user.ID == "" || !user.IsActive {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusOK, toAuthUserDTO(user))
	}
}

func ListUsers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var users []authUserRecord
		if err := db.Raw(`
			SELECT u.id::text AS id, COALESCE(u.username, u.email) AS username, u.email, u.full_name,
			       COALESCE(r.code, 'viewer') AS role, COALESCE(u.is_active, true) AS is_active,
			       u.created_at, u.updated_at
			FROM users u
			LEFT JOIN user_roles ur ON ur.user_id::text = u.id::text
			LEFT JOIN roles r ON r.id::text = ur.role_id::text
			ORDER BY u.created_at DESC, u.email
		`).Scan(&users).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		data := make([]authUserDTO, 0, len(users))
		for _, u := range users {
			data = append(data, toAuthUserDTO(u))
		}
		c.JSON(http.StatusOK, gin.H{"data": data})
	}
}

type userInput struct {
	Username string `json:"username"`
	Email    string `json:"email" binding:"required"`
	FullName string `json:"full_name" binding:"required"`
	Password string `json:"password"`
	Role     string `json:"role"`
	IsActive *bool  `json:"is_active"`
}

func CreateUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input userInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email, full_name and password required"})
			return
		}
		input.Username = normalizeUsername(input.Username, input.Email)
		input.Role = normalizeRole(input.Role)
		if len(input.Password) < 6 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Пароль должен быть не короче 6 символов"})
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		tx := db.Begin()
		var userID string
		if err := tx.Raw(`
			INSERT INTO users (username, email, full_name, password_hash, is_active, created_at, updated_at)
			VALUES (?, ?, ?, ?, true, NOW(), NOW())
			RETURNING id::text
		`, input.Username, strings.TrimSpace(input.Email), strings.TrimSpace(input.FullName), string(hash)).Scan(&userID).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "Не удалось создать пользователя: " + err.Error()})
			return
		}
		if err := assignRole(tx, userID, input.Role); err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := tx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		user, _ := findAuthUserByID(db, userID)
		c.JSON(http.StatusCreated, toAuthUserDTO(user))
	}
}

func UpdateUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var input userInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user payload"})
			return
		}
		input.Username = normalizeUsername(input.Username, input.Email)
		input.Role = normalizeRole(input.Role)
		isActive := true
		if input.IsActive != nil {
			isActive = *input.IsActive
		}

		tx := db.Begin()
		updates := map[string]any{
			"username":   input.Username,
			"email":      strings.TrimSpace(input.Email),
			"full_name":  strings.TrimSpace(input.FullName),
			"is_active":  isActive,
			"updated_at": time.Now(),
		}
		if strings.TrimSpace(input.Password) != "" {
			if len(input.Password) < 6 {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": "Пароль должен быть не короче 6 символов"})
				return
			}
			hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
			if err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			updates["password_hash"] = string(hash)
		}
		if err := tx.Table("users").Where("id::text = ?", id).Updates(updates).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "Не удалось обновить пользователя: " + err.Error()})
			return
		}
		if err := assignRole(tx, id, input.Role); err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := tx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		user, _ := findAuthUserByID(db, id)
		c.JSON(http.StatusOK, toAuthUserDTO(user))
	}
}

func DeleteUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := db.Table("users").Where("id::text = ?", c.Param("id")).Updates(map[string]any{"is_active": false, "updated_at": time.Now()}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Status(http.StatusNoContent)
	}
}

// IssueServiceToken — выдаёт долгоживущий JWT для service-аккаунта по SERVICE_API_KEY.
func IssueServiceToken() gin.HandlerFunc {
	return issueServiceTokenHandler()
}

func issueServiceTokenHandler() gin.HandlerFunc {
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

func findAuthUser(db *gorm.DB, login string) (authUserRecord, error) {
	var user authUserRecord
	err := db.Raw(`
		SELECT u.id::text AS id, COALESCE(u.username, u.email) AS username, u.email, u.full_name, u.password_hash,
		       COALESCE(r.code, 'viewer') AS role, COALESCE(u.is_active, true) AS is_active,
		       u.created_at, u.updated_at
		FROM users u
		LEFT JOIN user_roles ur ON ur.user_id::text = u.id::text
		LEFT JOIN roles r ON r.id::text = ur.role_id::text
		WHERE LOWER(COALESCE(u.username, '')) = LOWER(?) OR LOWER(u.email) = LOWER(?)
		ORDER BY CASE WHEN r.code = 'admin' THEN 1 WHEN r.code = 'editor' THEN 2 ELSE 3 END
		LIMIT 1
	`, login, login).Scan(&user).Error
	return user, err
}

func findAuthUserByID(db *gorm.DB, id string) (authUserRecord, error) {
	var user authUserRecord
	err := db.Raw(`
		SELECT u.id::text AS id, COALESCE(u.username, u.email) AS username, u.email, u.full_name, u.password_hash,
		       COALESCE(r.code, 'viewer') AS role, COALESCE(u.is_active, true) AS is_active,
		       u.created_at, u.updated_at
		FROM users u
		LEFT JOIN user_roles ur ON ur.user_id::text = u.id::text
		LEFT JOIN roles r ON r.id::text = ur.role_id::text
		WHERE u.id::text = ?
		ORDER BY CASE WHEN r.code = 'admin' THEN 1 WHEN r.code = 'editor' THEN 2 ELSE 3 END
		LIMIT 1
	`, id).Scan(&user).Error
	return user, err
}

func toAuthUserDTO(user authUserRecord) authUserDTO {
	return authUserDTO{ID: user.ID, Username: user.Username, Email: user.Email, FullName: user.FullName, Role: normalizeRole(user.Role), IsActive: user.IsActive, CreatedAt: user.CreatedAt, UpdatedAt: user.UpdatedAt}
}

func assignRole(db *gorm.DB, userID, roleCode string) error {
	var roleID string
	if err := db.Raw("SELECT id::text FROM roles WHERE code = ? LIMIT 1", normalizeRole(roleCode)).Scan(&roleID).Error; err != nil {
		return err
	}
	if roleID == "" {
		return nil
	}
	if err := db.Exec("DELETE FROM user_roles WHERE user_id::text = ?", userID).Error; err != nil {
		return err
	}
	return db.Exec("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", userID, roleID).Error
}

func normalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "admin", "editor", "viewer":
		return strings.ToLower(strings.TrimSpace(role))
	default:
		return "viewer"
	}
}

func normalizeUsername(username, email string) string {
	username = strings.TrimSpace(username)
	if username != "" {
		return username
	}
	return strings.TrimSpace(email)
}
