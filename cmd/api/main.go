package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/AleksKAG/construction-manager/internal/handlers"
	"github.com/AleksKAG/construction-manager/internal/middleware"
	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/AleksKAG/construction-manager/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/sirupsen/logrus"

	_ "github.com/mattn/go-sqlite3"
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

	logger.Info("Connecting to SQLite: ", dbPath)

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: gormLogger.Default.LogMode(gormLogger.Warn),
	})
	if err != nil {
		logger.Fatal("SQLite connection failed: ", err)
	}
	logger.Info("SQLite connected")

	if err := db.AutoMigrate(
		&models.ProjectObject{},
		&models.GanttTask{},
		&models.User{},
		&models.Role{},
		&models.Permission{},
		&models.UserRole{},
		&models.MenuItem{},
		&models.Dashboard{},
		&models.DashboardWidget{},
		&models.TemplateDefinition{},
		&models.TemplateColumn{},
		&models.ProjectTemplateRow{},
	); err != nil {
		logger.Fatal("Migration failed: ", err)
	}
	logger.Info("Migrations done")

	// Репозиторий + sample data
	repo := repository.NewProjectRepository(db)
	if err := services.LoadSampleData(repo, logger); err != nil {
		logger.Warn("Failed to load sample data: ", err)
	}
	if err := services.LoadStandardTemplates(repo, logger); err != nil {
		logger.Warn("Failed to load standard templates: ", err)
	}

	// === Router ===
	r := gin.Default()
	r.Use(gin.Recovery())

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
	})

	// Static files
	r.Static("/static/css", "./web/css")
	r.Static("/static/js", "./web/js")
	r.StaticFile("/", "./web/index.html")

	// Страницы - теперь обрабатываются через StaticFile
	// API
	api := r.Group("/api/v1")
	{
		// Health check — БЕЗ auth middleware!
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"status":    "ok",
				"database":  "sqlite",
				"timestamp": time.Now(),
			})
		})

		api.GET("/menu", handlers.MenuHandler)

		// Objects endpoints
		api.GET("/objects", handlers.ListObjects(repo))
		api.POST("/objects", handlers.CreateObject(repo))
		api.GET("/objects/:id", handlers.GetObject(repo))
		api.PUT("/objects/:id", handlers.UpdateObject(repo))
		api.DELETE("/objects/:id", handlers.DeleteObject(repo))

		// Gantt Tasks endpoints
		api.GET("/objects/:id/tasks", handlers.ListTasks(repo))
		api.POST("/tasks", handlers.CreateTask(repo))
		api.GET("/tasks/:id", handlers.GetTask(repo))
		api.PUT("/tasks/:id", handlers.UpdateTask(repo))
		api.DELETE("/tasks/:id", handlers.DeleteTask(repo))
	}

	// Запуск
	port := getEnv("PORT", "8080")
	logger.Infof("Server starting on :%s", port)

	// Graceful shutdown
	server := &http.Server{
		Addr:    ":" + port,
		Handler: r.Handler(),
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal(err)
		}
	}()

	// Ожидание сигнала завершения
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown: ", err)
	}

	logger.Info("Server exiting")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
