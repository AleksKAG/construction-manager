package database

import (
	"fmt"

	"gorm.io/gorm"
)

// EnsureApplicationConstraints keeps constraints that are required by the
// application but intentionally not declared on GORM models. Some legacy
// PostgreSQL databases have the project-code uniqueness as a table constraint
// (for example projects_code_key) rather than the GORM-generated constraint
// name (uni_projects_code). Declaring that uniqueness in the model makes
// AutoMigrate try to drop a non-existent constraint on those databases, which
// aborts container startup. Keeping the constraint in explicit SQL makes the
// startup migration idempotent across both schema.sql-created and GORM-created
// databases.
func EnsureApplicationConstraints(db *gorm.DB) error {
	if db == nil || db.Dialector == nil {
		return nil
	}

	switch db.Dialector.Name() {
	case "postgres":
		return ensurePostgresApplicationConstraints(db)
	case "sqlite":
		return db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_code_unique ON projects (code)").Error
	default:
		return nil
	}
}

func ensurePostgresApplicationConstraints(db *gorm.DB) error {
	const query = `
DO $$
BEGIN
    IF to_regclass('projects') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM pg_index i
           JOIN pg_class t ON t.oid = i.indrelid
           JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
           JOIN pg_namespace n ON n.oid = t.relnamespace
           WHERE n.nspname = current_schema()
             AND t.relname = 'projects'
             AND i.indisunique
             AND i.indnatts = 1
             AND a.attname = 'code'
       ) THEN
        CREATE UNIQUE INDEX idx_projects_code_unique ON projects (code);
    END IF;
END $$;`
	if err := db.Exec(query).Error; err != nil {
		return fmt.Errorf("ensure projects.code uniqueness: %w", err)
	}
	return nil
}
