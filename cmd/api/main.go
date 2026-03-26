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

	_ "modernc.org/sqlite" // ← это важно
)

func main() {
	logger := logrus.New()
	logger.SetFormatter(&logrus.TextFormatter{FullTimestamp: true})

	if err := os.MkdirAll("data", 0755); err != nil {
		logger.Fatal("Cannot create data directory:", err)
	}

	db, err := gorm.Open(gorm.Dialector(&sqlite.Dialector{
		DSN: "data/app.db",
	}), &gorm.Config{})
	if err != nil {
		logger.Fatal("SQLite connection failed:", err)
	}

	if err := db.AutoMigrate(&models.ProjectObject{}); err != nil {
		logger.Fatal("Migration failed:", err)
	}

	logger.Info("✅ SQLite connected and migrated successfully")

	repo := repository.NewProjectRepository(db)
	services.LoadSampleData(repo)

	r := gin.Default()

	r.LoadHTMLGlob("web/*.html")
	r.Static("/static", "./web/static")

	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", nil)
	})

	api := r.Group("/api/v1")
	{
		api.GET("/projects", handlers.ListProjects(repo))
		api.POST("/projects", handlers.CreateProject(repo))
		api.GET("/projects/:id", handlers.GetProject(repo))
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	logger.Infof("🚀 Server started on http://0.0.0.0:%s", port)
	if err := r.Run(":" + port); err != nil {
		logger.Fatal(err)
	}
}
