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

	// Проверка обязательных переменных окружения
	validateRequiredEnv(logger)

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
			&models.Project{},
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
			sqlDB, err := repo.RawDB().DB()
			dbStatus := "ok"
			if err != nil || sqlDB.Ping() != nil {
				dbStatus = "error"
			}
			c.JSON(http.StatusOK, gin.H{
				"status":    "ok",
				"database":  dbStatus,
				"db_driver": "postgres",
				"timestamp": time.Now().UTC(),
			})
		})

		api.GET("/menu", handlers.MenuHandler)

		// Projects — верхний уровень
		api.GET("/projects", handlers.ListProjects(repo))
		api.POST("/projects", handlers.CreateProject(repo))
		api.GET("/projects/:id", handlers.GetProject(repo))
		api.PUT("/projects/:id", handlers.UpdateProject(repo))
		api.DELETE("/projects/:id", handlers.DeleteProject(repo))

		// Группа с JWT — шаблоны и ИРД
		templates := api.Group("/")
		templates.Use(middleware.JWTAuthMiddleware())
		{
			templates.GET("/templates", middleware.RequireRoles("viewer", "editor", "admin"), handlers.ListTemplates(repo))
			// ИРД: роут на схему шаблона — перехватывает ДО общего /templates/:code
			// Возвращает колонки прямо из кода, без обращения к БД (работает на чистой базе)
			templates.GET("/templates/input_design_data", middleware.RequireRoles("viewer", "editor", "admin"), handlers.GetIrdTemplate())
			templates.GET("/templates/:code", middleware.RequireRoles("viewer", "editor", "admin"), handlers.GetTemplate(repo))

			// ИРД: специальные роуты ПЕРЕХВАТЫВАЮТ input_design_data ДО общих роутов.
			// Важно: статические сегменты (input_design_data) в Gin имеют приоритет над
			// параметрическими (:code), поэтому порядок здесь не критичен, но для ясности
			// оставляем их перед общими.
			templates.GET("/objects/:id/templates/input_design_data/rows", middleware.RequireRoles("viewer", "editor", "admin"), handlers.ListIrdAsTemplateRows(repo))
			templates.POST("/objects/:id/templates/input_design_data/rows", middleware.RequireRoles("editor", "admin"), handlers.CreateIrdFromTemplateRow(repo))
			templates.POST("/objects/:id/templates/input_design_data/import", middleware.RequireRoles("editor", "admin"), handlers.ImportIrdTemplateRows(repo))

			// Общие роуты шаблонов (для всех кодов кроме input_design_data)
			templates.GET("/objects/:id/templates/:code/rows", middleware.RequireRoles("viewer", "editor", "admin"), handlers.ListTemplateRows(repo))
			templates.POST("/objects/:id/templates/:code/rows", middleware.RequireRoles("editor", "admin"), handlers.CreateTemplateRow(repo))
			templates.POST("/objects/:id/templates/:code/import", middleware.RequireRoles("editor", "admin"), handlers.ImportTemplateRowsBatch(repo))
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
		api.POST("/projects/:id/design/:stage/registry/import", handlers.ImportRegistryBatch(repo))
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

// validateRequiredEnv проверяет обязательные переменные окружения.
// Завершает процесс с ошибкой, если критически важные переменные отсутствуют.
func validateRequiredEnv(logger *logrus.Logger) {
	required := []string{
		"JWT_SECRET",
		"SERVICE_API_KEY",
	}
	missing := make([]string, 0)
	for _, key := range required {
		if strings.TrimSpace(os.Getenv(key)) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		logger.Fatalf("Missing required environment variables: %s\nSet them in .env file or environment", strings.Join(missing, ", "))
	}
	logger.Info("Environment validation passed")
}
