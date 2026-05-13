package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
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

	"gorm.io/driver/postgres"
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

	dsn := resolveDatabaseDSN()
	if dsn == "" {
		logger.Fatal("DATABASE_URL is required (or set POSTGRES*/POSTGRESQL* variables)")
	}

	logger.Info("Connecting to PostgreSQL")
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormLogger.New(log.New(os.Stdout, "\r\n", log.LstdFlags), gormLogger.Config{
			SlowThreshold:             500 * time.Millisecond,
			LogLevel:                  gormLogger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		}),
	})
	if err != nil {
		logger.Fatal("PostgreSQL connection failed: ", err)
	}
	logger.Info("PostgreSQL connected")

	if shouldRunAutoMigrate() {
		logger.Info("RUN_DB_MIGRATIONS=true, running full GORM AutoMigrate")
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
	} else {
		logger.Info("RUN_DB_MIGRATIONS!=true, running safe minimum migrations for critical tables")
		if err := db.AutoMigrate(
			&models.MenuItem{},
			&models.TemplateDefinition{},
			&models.TemplateColumn{},
			&models.ProjectTemplateRow{},
		); err != nil {
			logger.Fatal("Minimum migration failed: ", err)
		}
		logger.Info("Minimum migrations done")
	}

	// Репозиторий + sample data
	repo := repository.NewGormRepository(db)
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
				"database":  "postgres",
				"timestamp": time.Now(),
			})
		})

		api.GET("/menu", handlers.MenuHandler)

		// Авторизация — открытые эндпоинты (без JWT)
		api.POST("/auth/token", handlers.IssueToken())
		api.POST("/auth/login", handlers.Login())
		api.POST("/auth/service-token", handlers.IssueServiceToken())

		// Все защищённые роуты — под JWT
		secured := api.Group("/")
		secured.Use(middleware.JWTAuthMiddleware())
		{
			// Шаблоны и ИРД
			secured.GET("/templates", middleware.RequireRoles("viewer", "editor", "admin"), handlers.ListTemplates(repo))
			secured.GET("/templates/input_design_data", middleware.RequireRoles("viewer", "editor", "admin"), handlers.GetIrdTemplate())
			secured.GET("/templates/:code", middleware.RequireRoles("viewer", "editor", "admin"), handlers.GetTemplate(repo))

			secured.GET("/objects/:id/templates/input_design_data/rows", middleware.RequireRoles("viewer", "editor", "admin"), handlers.ListIrdAsTemplateRows(repo))
			secured.POST("/objects/:id/templates/input_design_data/rows", middleware.RequireRoles("editor", "admin"), handlers.CreateIrdFromTemplateRow(repo))
			secured.POST("/objects/:id/templates/input_design_data/import", middleware.RequireRoles("editor", "admin"), handlers.ImportIrdTemplateRows(repo))

			secured.GET("/objects/:id/templates/:code/rows", middleware.RequireRoles("viewer", "editor", "admin"), handlers.ListTemplateRows(repo))
			secured.POST("/objects/:id/templates/:code/rows", middleware.RequireRoles("editor", "admin"), handlers.CreateTemplateRow(repo))
			secured.POST("/objects/:id/templates/:code/import", middleware.RequireRoles("editor", "admin"), handlers.ImportTemplateRowsBatch(repo))
			secured.PUT("/template-rows/:rowId", middleware.RequireRoles("editor", "admin"), handlers.UpdateTemplateRow(repo))
			secured.DELETE("/template-rows/:rowId", middleware.RequireRoles("admin"), handlers.DeleteTemplateRow(repo))
			secured.GET("/objects/:id/templates/:code/export.csv", middleware.RequireRoles("viewer", "editor", "admin"), handlers.ExportTemplateRowsXLSX(repo))

			secured.PUT("/ird-rows/:rowId", middleware.RequireRoles("editor", "admin"), handlers.UpdateIrdFromTemplateRow(repo))
			secured.DELETE("/ird-rows/:rowId", middleware.RequireRoles("admin"), handlers.DeleteIrdAsTemplateRow(repo))

			// Dashboard & Agent
			secured.GET("/dashboard/progress/:id", handlers.GetDashboardProgress(repo))
			secured.GET("/dashboard/metrics/:projectId", handlers.GetDashboardMetrics(repo))
			secured.POST("/agent/summary", handlers.GetAgentSummary(repo))
			secured.POST("/ai/chat", handlers.GetAIChatStream(repo))
			secured.GET("/estimates/:projectId/summary", handlers.GetEstimateSummary(repo))
			secured.GET("/tep/:projectId", handlers.GetTEPByProject(repo))
			secured.PATCH("/tep/:id", handlers.PatchTEPRow(repo))
			secured.GET("/dashboard/upcoming-tasks", handlers.GetUpcomingTasks(repo))

			// Docs Stage P
			secured.GET("/projects/:id/docs/p", handlers.ListDocsP(repo))
			secured.POST("/projects/:id/docs/p", handlers.CreateDocP(repo))
			secured.PUT("/projects/:id/docs/p/:docId", handlers.UpdateDocP(repo))
			secured.DELETE("/projects/:id/docs/p/:docId", handlers.DeleteDocP(repo))
			secured.GET("/projects/:id/docs/p/export.xlsx", handlers.ExportDocsPXLSX(repo))

			// Docs Stage R
			secured.GET("/projects/:id/docs/r", handlers.ListDocsR(repo))
			secured.POST("/projects/:id/docs/r", handlers.CreateDocR(repo))
			secured.PUT("/projects/:id/docs/r/:docId", handlers.UpdateDocR(repo))
			secured.DELETE("/projects/:id/docs/r/:docId", handlers.DeleteDocR(repo))
			secured.GET("/projects/:id/docs/r/:docId/revisions", handlers.ListDocRRevisions(repo))
			secured.POST("/projects/:id/docs/r/:docId/revisions", handlers.AddDocRRevision(repo))

			// Registry
			secured.GET("/projects/:id/design/:stage/registry", handlers.ListRegistry(repo))
			secured.POST("/projects/:id/design/:stage/registry", handlers.UpsertRegistry(repo))
			secured.POST("/projects/:id/design/:stage/registry/import", handlers.ImportRegistryBatch(repo))
			secured.DELETE("/projects/:id/design/:stage/registry/:rowId", handlers.DeleteRegistry(repo))

			// Workforce
			secured.GET("/projects/:id/smr/workforce", handlers.ListWorkforceByProject(repo))
			secured.POST("/projects/:id/smr/workforce", handlers.CreateWorkforceRecord(repo))

			// СВОР
			secured.GET("/projects/:id/svor", handlers.ListSvor(repo))
			secured.POST("/projects/:id/svor", handlers.CreateSvor(repo))
			secured.PATCH("/projects/:id/svor/:svorId", handlers.PatchSvor(repo))
			secured.GET("/projects/:id/svor/:svorId/history", handlers.GetSvorHistory(repo))
			secured.GET("/projects/:id/svor/dashboard", handlers.GetSvorDashboard(repo))
			secured.POST("/projects/:id/svor/import", handlers.ImportSvor(repo))
			secured.GET("/projects/:id/svor/report.xlsx", handlers.ExportSvorReportXLSX(repo))

			// IRD
			secured.GET("/objects/:id/ird", handlers.ListIrdDocuments(repo))
			secured.POST("/objects/:id/ird", handlers.CreateIrdDocument(repo))
			secured.GET("/ird/:irdId", handlers.GetIrdDocument(repo))
			secured.PUT("/ird/:irdId", handlers.UpdateIrdDocument(repo))
			secured.DELETE("/ird/:irdId", handlers.DeleteIrdDocument(repo))

			// Tasks
			secured.GET("/tasks", handlers.ListTasks(repo))
			secured.POST("/tasks", handlers.CreateTask(repo))
			secured.GET("/tasks/:id", handlers.GetTask(repo))
			secured.PUT("/tasks/:id", handlers.UpdateTask(repo))
			secured.DELETE("/tasks/:id", handlers.DeleteTask(repo))
			secured.GET("/tasks/by-object", handlers.ListTasksByObject(repo))

			// Objects
			secured.GET("/objects", handlers.ListObjects(repo))
			secured.POST("/objects", handlers.CreateObject(repo))
			secured.GET("/objects/:id", handlers.GetObject(repo))
			secured.GET("/objects/:id/menu", handlers.ListProjectMenu(repo))
			secured.PUT("/objects/:id", handlers.UpdateObject(repo))
			secured.DELETE("/objects/:id", handlers.DeleteObject(repo))
		}
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

func shouldRunAutoMigrate() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("RUN_DB_MIGRATIONS")), "true")
}

func resolveDatabaseDSN() string {
	if dsn := strings.TrimSpace(os.Getenv("DATABASE_URL")); dsn != "" {
		return dsn
	}

	host := firstNonEmptyEnv("POSTGRESQL_HOST", "POSTGRES_HOST")
	port := firstNonEmptyEnv("POSTGRESQL_PORT", "POSTGRES_PORT")
	user := firstNonEmptyEnv("POSTGRESQL_USER", "POSTGRES_USER")
	password := firstNonEmptyEnv("POSTGRESQL_PASSWORD", "POSTGRES_PASSWORD")
	dbname := firstNonEmptyEnv("POSTGRESQL_DBNAME", "POSTGRES_DB")
	sslmode := firstNonEmptyEnv("POSTGRESQL_SSLMODE", "POSTGRES_SSLMODE")

	if host == "" || user == "" || password == "" || dbname == "" {
		return ""
	}
	if port == "" {
		port = "5432"
	}
	if sslmode == "" {
		sslmode = "require"
	}

	return "host=" + host +
		" port=" + port +
		" user=" + user +
		" password=" + password +
		" dbname=" + dbname +
		" sslmode=" + sslmode
}

func firstNonEmptyEnv(keys ...string) string {
	for _, key := range keys {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return ""
}
