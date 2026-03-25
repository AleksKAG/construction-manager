package main

import (
	
	"net/http"
	"os"

	"github.com/AleksKAG/construction-manager/internal/handlers"
	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/AleksKAG/construction-manager/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"modernc.org/sqlite"
	
	"gorm.io/gorm"

	
)

func main() {
	logger := logrus.New()
	logger.SetFormatter(&logrus.TextFormatter{})

	// SQLite
	// ====================== SQLite (без CGO) ======================
	if err := os.MkdirAll("data", 0755); err != nil {
		logger.Fatal("failed to create data directory: ", err)
	}

	db, err := gorm.Open(sqlite.Open("data/app.db"), &gorm.Config{})
	if err != nil {
		logger.Fatal("failed to connect to sqlite: ", err)
	}

	// Миграции
	err = db.AutoMigrate(&models.ProjectObject{})
	if err != nil {
		logger.Fatal("failed to migrate database: ", err)
	}
	logger.Info("SQLite connected and migrated")


	// Репозиторий + sample data
	repo := repository.NewProjectRepository(db)
	services.LoadSampleData(repo)

	r := gin.Default()

	// HTML
	r.LoadHTMLGlob("web/*.html")
	r.Static("/static", "./web/static")

	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", nil)
	})

	// API
	api := r.Group("/api/v1")
	{
		api.GET("/objects", handlers.ListObjects(repo))
		api.POST("/objects", handlers.CreateObject(repo))
		api.GET("/objects/:id", handlers.GetObject(repo))
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	logger.Infof("Server started on http://0.0.0.0:%s", port)
	if err := r.Run(":" + port); err != nil {
		logger.Fatal(err)
	}
}
