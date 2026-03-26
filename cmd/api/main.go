package main

import (
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/AleksKAG/ai-construction-manager/internal/handlers"
	"github.com/AleksKAG/ai-construction-manager/internal/models"
	"github.com/AleksKAG/ai-construction-manager/internal/repository"
	"github.com/AleksKAG/ai-construction-manager/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/sirupsen/logrus"
	
	
	_ "modernc.org/sqlite"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

func main() {
	// Загрузка .env
	_ = godotenv.Load()

	// Логгер
	logger := logrus.New()
	logger.SetFormatter(&logrus.TextFormatter{})
	logger.SetLevel(logrus.InfoLevel)

	// === SQLite подключение ===
	dbPath := getEnv("DB_PATH", "/tmp/construction_ai.db")
	
	// Создаём директорию если нет
	_ = os.MkdirAll(filepath.Dir(dbPath), 0755)
	
	logger.Info("🗄️ Connecting to SQLite: ", dbPath)
	
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: gormLogger.Default.LogMode(gormLogger.Warn),
	})
	if err != nil {
		logger.Fatal("❌ SQLite connection failed: ", err)
	}
	logger.Info("✅ SQLite connected")

	// Миграции — только простые модели!
	// ⚠️ НЕ добавляйте ProjectGraph с []GanttTask!
	if err := db.AutoMigrate(&models.ProjectObject{}, &models.GanttTask{}); err != nil {
		logger.Fatal("❌ Migration failed: ", err)
	}
	logger.Info("✅ Migrations done")

	// Репозиторий + sample data
	repo := repository.NewProjectRepository(db)
	services.LoadSampleData(repo)

	// === Router ===
	r := gin.Default()
	r.Use(gin.Recovery())
	
	// Static files
	r.Static("/static", "./web/static")
	r.LoadHTMLGlob("web/*.html")

	// Страницы
	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", nil)
	})
	r.GET("/login", func(c *gin.Context) {
		c.HTML(http.StatusOK, "login.html", nil)
	})
	r.GET("/objects", func(c *gin.Context) {
		c.HTML(http.StatusOK, "objects.html", nil)
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
		
		api.GET("/menu", handlers.MenuHandler)
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