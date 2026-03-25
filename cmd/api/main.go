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

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	
)

func main() {
	logger := logrus.New()
	logger.SetFormatter(&logrus.TextFormatter{})

	// SQLite
	if err := os.MkdirAll("data", 0755); err != nil {
		logger.Fatal("failed to create data directory: ", err)
	}

	db, err := gorm.Open(sqlite.Open("data/app.db"), &gorm.Config{
	 
})
if err != nil {
	logger.Fatal("SQLite connection failed: ", err)
}

	// Миграции
	if err := db.AutoMigrate(&models.ProjectObject{}, &models.GanttTask{}); err != nil {
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
getEnv("DB_PATH", "/app/data/app.db") 
port := getEnv("PORT", "8080")
	// API
	api := r.Group("/api/v1")
	{
		api.GET("/objects", handlers.ListObjects(repo))
		api.POST("/objects", handlers.CreateObject(repo))
		api.GET("/objects/:id", handlers.GetObject(repo))
	}

	port = os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	logger.Infof("Server started on http://0.0.0.0:%s", port)
	if err := r.Run(":" + port); err != nil {
		logger.Fatal(err)
	}
}
func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}