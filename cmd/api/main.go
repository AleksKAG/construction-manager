package main

import (
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/AleksKAG/construction-manager/internal/handlers"
	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/AleksKAG/construction-manager/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"

	// ✅ SQLite драйверы (pure Go, без CGO):
	"gorm.io/driver/sqlite" // GORM driver для SQLite
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger" // ← алиас! чтобы не конфликтовал с logrus
	_ "modernc.org/sqlite"           // blank import для регистрации
)

func main() {
	logger := logrus.New()
	logger.SetFormatter(&logrus.TextFormatter{})

	// === SQLite подключение ===
	// Используем /tmp для TimeWeb (не требует volumes)
	dbPath := getEnv("DB_PATH", "/tmp/app.db")
	
	// Создаём директорию если нет
	_ = os.MkdirAll(filepath.Dir(dbPath), 0755)
	
	logger.Info("🗄️ Connecting to SQLite: ", dbPath)
	
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: gormLogger.Default.LogMode(gormLogger.Warn), // ← gormLogger, не logger!
	})
	if err != nil {
		logger.Fatal("❌ SQLite connection failed: ", err)
	}
	logger.Info("✅ SQLite connected")

	// Миграции — только простые модели!
	// ⚠️ НЕ добавляйте ProjectGraph с []GanttTask!
	if err := db.AutoMigrate(&models.ProjectObject{}); err != nil {
		logger.Fatal("❌ Migration failed: ", err)
	}
	logger.Info("✅ Migrations done")

	// Репозиторий + sample data
	repo := repository.NewProjectRepository(db)
	services.LoadSampleData(repo)

	// === Router ===
	r := gin.Default()
	r.LoadHTMLGlob("web/*.html")
	r.Static("/static", "./web/static")

	// Страницы
	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", nil)
	})

	// API
	api := r.Group("/api/v1")
	{
		// ✅ Health check — БЕЗ auth middleware!
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"status":    "ok",
				"database":  "sqlite",
				"timestamp": time.Now(),
			})
		})
		
		api.GET("/objects", handlers.ListObjects(repo))
		api.POST("/objects", handlers.CreateObject(repo))
		api.GET("/objects/:id", handlers.GetObject(repo))
	}

	// Запуск
	port := getEnv("PORT", "8080")
	logger.Infof("🚀 Server starting on :%s", port)
	if err := r.Run(":" + port); err != nil {
		logger.Fatal(err)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}