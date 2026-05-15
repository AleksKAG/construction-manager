package database

import (
	"fmt"

	"gorm.io/gorm"
)

// EnsureApplicationConstraints keeps constraints that are required by the
// application and makes startup idempotent across both schema.sql-created and
// GORM-created databases. Project.Code also declares its uniqueness in the
// GORM model so AutoMigrate treats existing legacy unique constraints (for
// example projects_code_key) as desired instead of attempting to drop the
// non-existent GORM-generated constraint name (uni_projects_code). The explicit
// SQL below still backfills uniqueness for databases created before that model
// tag existed.
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
