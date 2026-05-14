package database

import (
	"fmt"
	"strings"

	"gorm.io/gorm"
)

// EnsureTextIDCompatibility prepares older PostgreSQL schemas for the current
// GORM models, which store application identifiers as text. Legacy installs may
// still have UUID project/user IDs and UUID foreign keys from the SQL schema
// files. GORM AutoMigrate cannot alter those columns while the old FK
// constraints are in place, so we remove the legacy FKs first and explicitly
// cast known identifier columns to text before AutoMigrate runs.
func EnsureTextIDCompatibility(db *gorm.DB) error {
	if db == nil || db.Dialector == nil || db.Dialector.Name() != "postgres" {
		return nil
	}

	if err := dropLegacyForeignKeys(db); err != nil {
		return err
	}

	for _, col := range legacyTextIDColumns() {
		if err := alterColumnToText(db, col.table, col.column, col.notNull); err != nil {
			return err
		}
	}

	return nil
}

type textIDColumn struct {
	table   string
	column  string
	notNull bool
}

func legacyTextIDColumns() []textIDColumn {
	return []textIDColumn{
		{table: "projects", column: "id", notNull: true},
		{table: "project_objects", column: "id", notNull: true},
		{table: "project_objects", column: "project_id", notNull: true},
		{table: "gantt_tasks", column: "id", notNull: true},
		{table: "gantt_tasks", column: "object_id"},
		{table: "gantt_tasks", column: "linked_registry_id"},
		{table: "roles", column: "id", notNull: true},
		{table: "users", column: "id", notNull: true},
		{table: "permissions", column: "id", notNull: true},
		{table: "user_roles", column: "user_id", notNull: true},
		{table: "user_roles", column: "role_id", notNull: true},
		{table: "user_roles", column: "project_id"},
		{table: "menu_items", column: "id", notNull: true},
		{table: "menu_items", column: "project_id"},
		{table: "menu_items", column: "parent_id"},
		{table: "dashboards", column: "id", notNull: true},
		{table: "dashboards", column: "project_id"},
		{table: "dashboard_widgets", column: "id", notNull: true},
		{table: "dashboard_widgets", column: "dashboard_id", notNull: true},
		{table: "template_definitions", column: "id", notNull: true},
		{table: "template_columns", column: "id", notNull: true},
		{table: "project_template_rows", column: "id", notNull: true},
		{table: "project_template_rows", column: "project_id", notNull: true},
		{table: "project_template_rows", column: "created_by_user"},
		{table: "doc_stage_ps", column: "id", notNull: true},
		{table: "doc_stage_ps", column: "project_id", notNull: true},
		{table: "doc_stage_rs", column: "id", notNull: true},
		{table: "doc_stage_rs", column: "project_id", notNull: true},
		{table: "doc_stage_r_revisions", column: "id", notNull: true},
		{table: "doc_stage_r_revisions", column: "doc_r_id", notNull: true},
		{table: "svor_records", column: "id", notNull: true},
		{table: "svor_records", column: "project_id", notNull: true},
		{table: "svor_records", column: "doc_r_id", notNull: true},
		{table: "svor_histories", column: "id", notNull: true},
		{table: "svor_histories", column: "svor_record_id", notNull: true},
		{table: "svor_histories", column: "user_id"},
		{table: "ird_documents", column: "id", notNull: true},
		{table: "ird_documents", column: "project_id", notNull: true},
		{table: "document_registries", column: "id", notNull: true},
		{table: "document_registries", column: "project_id", notNull: true},
		{table: "document_registries", column: "linked_task_id"},
		{table: "workforce_daily_records", column: "id", notNull: true},
		{table: "workforce_daily_records", column: "task_id", notNull: true},
	}
}

func dropLegacyForeignKeys(db *gorm.DB) error {
	var constraints []struct {
		Schema string
		Table  string
		Name   string
	}

	tables := quotedStringList(legacyTableNames())
	query := fmt.Sprintf(`
SELECT n.nspname AS schema, c.relname AS "table", con.conname AS name
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE con.contype = 'f'
  AND n.nspname = current_schema()
  AND (
    c.relname IN (%[1]s)
    OR con.confrelid IN (
      SELECT oid FROM pg_class WHERE relname IN (%[1]s)
    )
  )`, tables)
	if err := db.Raw(query).Scan(&constraints).Error; err != nil {
		return fmt.Errorf("inspect legacy foreign keys: %w", err)
	}

	for _, constraint := range constraints {
		statement := fmt.Sprintf(
			"ALTER TABLE %s.%s DROP CONSTRAINT IF EXISTS %s",
			quoteIdent(constraint.Schema),
			quoteIdent(constraint.Table),
			quoteIdent(constraint.Name),
		)
		if err := db.Exec(statement).Error; err != nil {
			return fmt.Errorf("drop legacy foreign key %s on %s: %w", constraint.Name, constraint.Table, err)
		}
	}
	return nil
}

func legacyTableNames() []string {
	seen := map[string]bool{}
	var tables []string
	for _, col := range legacyTextIDColumns() {
		if !seen[col.table] {
			seen[col.table] = true
			tables = append(tables, col.table)
		}
	}
	return tables
}

func alterColumnToText(db *gorm.DB, table, column string, notNull bool) error {
	var dataType string
	if err := db.Raw(`
SELECT data_type
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = ?
  AND column_name = ?`, table, column).Scan(&dataType).Error; err != nil {
		return fmt.Errorf("inspect %s.%s type: %w", table, column, err)
	}
	if dataType == "" || dataType == "text" {
		return nil
	}

	tableName := quoteIdent(table)
	columnName := quoteIdent(column)
	if err := db.Exec(fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s DROP DEFAULT", tableName, columnName)).Error; err != nil {
		return fmt.Errorf("drop default for %s.%s: %w", table, column, err)
	}
	if err := db.Exec(fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s TYPE text USING %s::text", tableName, columnName, columnName)).Error; err != nil {
		return fmt.Errorf("alter %s.%s to text: %w", table, column, err)
	}
	if notNull {
		if err := db.Exec(fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %s SET NOT NULL", tableName, columnName)).Error; err != nil {
			return fmt.Errorf("set not null on %s.%s: %w", table, column, err)
		}
	}
	return nil
}

func quoteIdent(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func quotedStringList(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, quoteLiteral(value))
	}
	return strings.Join(quoted, ",")
}

func quoteLiteral(value string) string {
	return `'` + strings.ReplaceAll(value, `'`, `''`) + `'`
}
