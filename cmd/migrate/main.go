package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

func main() {
	// Загрузка .env
	_ = godotenv.Load()

	dsn := resolveDatabaseDSN()
	if dsn == "" {
		fmt.Println("ERROR: DATABASE_URL is required (or set POSTGRES*/POSTGRESQL* variables)")
		os.Exit(1)
	}

	fmt.Println("Connecting to PostgreSQL...")
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormLogger.Default.LogMode(gormLogger.Info),
	})
	if err != nil {
		fmt.Printf("ERROR: PostgreSQL connection failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("PostgreSQL connected successfully")

	fmt.Println("Running GORM AutoMigrate...")
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
		fmt.Printf("ERROR: Migration failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Migrations completed successfully")

	// Проверка наличия ключевых таблиц
	tables := []string{"template_definitions", "template_columns", "project_template_rows"}
	for _, table := range tables {
		exists := db.Migrator().HasTable(table)
		if exists {
			fmt.Printf("✓ Table '%s' exists\n", table)
		} else {
			fmt.Printf("✗ Table '%s' NOT found\n", table)
		}
	}

	fmt.Println("\nMigration script finished.")
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
