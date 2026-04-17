package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
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

	// === SQLite подключение — база в корне проекта ===
	dbPath := getEnv("DB_PATH", "./construction.db")

	// Создаём папку data, если хочешь хранить в подпапке (рекомендую)
	_ = os.MkdirAll("./data", 0755)
	// dbPath = "./data/construction.db"   // раскомментируй, если хочешь в папке data

	logger.Infof("Connecting to SQLite: %s", dbPath)

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
		&models.DocumentRegistry{},
		&models.WorkforceDailyRecord{},
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
		&models.DocStageP{},
		&models.DocStageR{},
		&models.DocStageRRevision{},
		&models.SvorRecord{},
		&models.SvorHistory{},
		&models.IrdDocument{},
	); err != nil {
		logger.Fatal("Migration failed: ", err)
	}
	logger.Info("Migrations done")

	// Репозиторий + sample data
	repo := repository.NewSQLiteRepository(db)
	if err := services.LoadSampleData(repo, logger); err != nil {
		logger.Warn("Failed to load sample data: ", err)
	}
	if err := services.LoadStandardTemplates(repo, logger); err != nil {
		logger.Warn("Failed to load standard templates: ", err)
	}
	if err := services.EnsureProjectMenus(context.Background(), repo.RawDB()); err != nil {
		logger.Warn("Failed to load project menus: ", err)
	}
	if err := services.EnsureIrdTemplate(repo, logger); err != nil {
		logger.Warn("Failed to seed IRD template: ", err)
	}

	// === Router ===
	r := gin.Default()
	r.Use(gin.Recovery())

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
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
		api.POST("/auth/token", handlers.IssueToken())

		// Группа с JWT — шаблоны и ИРД
		templates := api.Group("/")
		templates.Use(middleware.JWTAuthMiddleware())
		{
			templates.GET("/templates", middleware.RequireRoles("viewer", "editor", "admin"), handlers.ListTemplates(repo))
			templates.GET("/templates/:code", middleware.RequireRoles("viewer", "editor", "admin"), handlers.GetTemplate(repo))

			// ИРД: специальные роуты ПЕРЕХВАТЫВАЮТ input_design_data ДО общих роутов.
			// Важно: статические сегменты (input_design_data) в Gin имеют приоритет над
			// параметрическими (:code), поэтому порядок здесь не критичен, но для ясности
			// оставляем их перед общими.
			templates.GET("/objects/:id/templates/input_design_data/rows", middleware.RequireRoles("viewer", "editor", "admin"), handlers.ListIrdAsTemplateRows(repo))
			templates.POST("/objects/:id/templates/input_design_data/rows", middleware.RequireRoles("editor", "admin"), handlers.CreateIrdFromTemplateRow(repo))

			// Общие роуты шаблонов (для всех кодов кроме input_design_data)
			templates.GET("/objects/:id/templates/:code/rows", middleware.RequireRoles("viewer", "editor", "admin"), handlers.ListTemplateRows(repo))
			templates.POST("/objects/:id/templates/:code/rows", middleware.RequireRoles("editor", "admin"), handlers.CreateTemplateRow(repo))
			templates.PUT("/template-rows/:rowId", middleware.RequireRoles("editor", "admin"), handlers.UpdateTemplateRow(repo))
			templates.DELETE("/template-rows/:rowId", middleware.RequireRoles("admin"), handlers.DeleteTemplateRow(repo))
			templates.GET("/objects/:id/templates/:code/export.csv", middleware.RequireRoles("viewer", "editor", "admin"), handlers.ExportTemplateRowsXLSX(repo))

			// ИРД: обновление и удаление через адаптер (отдельный префикс /ird-rows/)
			templates.PUT("/ird-rows/:rowId", middleware.RequireRoles("editor", "admin"), handlers.UpdateIrdFromTemplateRow(repo))
			templates.DELETE("/ird-rows/:rowId", middleware.RequireRoles("admin"), handlers.DeleteIrdAsTemplateRow(repo))
		}

		// Dashboard & Agent
		api.GET("/dashboard/progress/:id", handlers.GetDashboardProgress(repo))
		api.GET("/dashboard/metrics/:projectId", handlers.GetDashboardMetrics(repo))
		api.POST("/agent/summary", handlers.GetAgentSummary(repo))
		api.POST("/ai/chat", handlers.GetAIChatStream(repo))
		api.GET("/estimates/:projectId/summary", handlers.GetEstimateSummary(repo))
		api.GET("/tep/:projectId", handlers.GetTEPByProject(repo))
		api.PATCH("/tep/:id", handlers.PatchTEPRow(repo))
		api.GET("/dashboard/upcoming-tasks", handlers.GetUpcomingTasks(repo))

		// Docs Stage P — полный CRUD
		api.GET("/projects/:id/docs/p", handlers.ListDocsP(repo))
		api.POST("/projects/:id/docs/p", handlers.CreateDocP(repo))
		api.PUT("/projects/:id/docs/p/:docId", handlers.UpdateDocP(repo))
		api.DELETE("/projects/:id/docs/p/:docId", handlers.DeleteDocP(repo))
		api.GET("/projects/:id/docs/p/export.xlsx", handlers.ExportDocsPXLSX(repo))

		// Docs Stage R — полный CRUD
		api.GET("/projects/:id/docs/r", handlers.ListDocsR(repo))
		api.POST("/projects/:id/docs/r", handlers.CreateDocR(repo))
		api.PUT("/projects/:id/docs/r/:docId", handlers.UpdateDocR(repo))
		api.DELETE("/projects/:id/docs/r/:docId", handlers.DeleteDocR(repo))
		api.GET("/projects/:id/docs/r/:docId/revisions", handlers.ListDocRRevisions(repo))
		api.POST("/projects/:id/docs/r/:docId/revisions", handlers.AddDocRRevision(repo))

		// Registry
		api.GET("/projects/:id/design/:stage/registry", handlers.ListRegistry(repo))
		api.POST("/projects/:id/design/:stage/registry", handlers.UpsertRegistry(repo))
		api.DELETE("/projects/:id/design/:stage/registry/:rowId", handlers.DeleteRegistry(repo))

		// Workforce
		api.GET("/projects/:id/smr/workforce", handlers.ListWorkforceByProject(repo))
		api.POST("/projects/:id/smr/workforce", handlers.CreateWorkforceRecord(repo))

		// СВОР
		api.GET("/projects/:id/svor", handlers.ListSvor(repo))
		api.POST("/projects/:id/svor", handlers.CreateSvor(repo))
		api.PATCH("/projects/:id/svor/:svorId", handlers.PatchSvor(repo))
		api.GET("/projects/:id/svor/:svorId/history", handlers.GetSvorHistory(repo))
		api.GET("/projects/:id/svor/dashboard", handlers.GetSvorDashboard(repo))
		api.POST("/projects/:id/svor/import", handlers.ImportSvor(repo))
		api.GET("/projects/:id/svor/report.xlsx", handlers.ExportSvorReportXLSX(repo))

		// IRD — прямые endpoints (используются если нужен прямой доступ без template-обёртки)
		api.GET("/objects/:id/ird", handlers.ListIrdDocuments(repo))
		api.POST("/objects/:id/ird", handlers.CreateIrdDocument(repo))
		api.GET("/ird/:irdId", handlers.GetIrdDocument(repo))
		api.PUT("/ird/:irdId", handlers.UpdateIrdDocument(repo))
		api.DELETE("/ird/:irdId", handlers.DeleteIrdDocument(repo))

		// Tasks — ПЕРЕД /objects/:id чтобы избежать конфликта роутов
		api.GET("/tasks", handlers.ListTasks(repo))
		api.POST("/tasks", handlers.CreateTask(repo))
		api.GET("/tasks/:id", handlers.GetTask(repo))
		api.PUT("/tasks/:id", handlers.UpdateTask(repo))
		api.DELETE("/tasks/:id", handlers.DeleteTask(repo))
		api.GET("/tasks/by-object", handlers.ListTasksByObject(repo))

		// Objects — ПОСЛЕ /tasks
		api.GET("/objects", handlers.ListObjects(repo))
		api.POST("/objects", handlers.CreateObject(repo))
		api.GET("/objects/:id", handlers.GetObject(repo))
		api.GET("/objects/:id/menu", handlers.ListProjectMenu(repo))
		api.PUT("/objects/:id", handlers.UpdateObject(repo))
		api.DELETE("/objects/:id", handlers.DeleteObject(repo))
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
