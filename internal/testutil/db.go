package testutil

import (
	"os"
	"strings"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// OpenTestDB opens PostgreSQL test database defined via CM_TEST_DATABASE_URL.
// Tests are skipped when DSN is not configured to avoid SQLite fallback.
func OpenTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := strings.TrimSpace(os.Getenv("CM_TEST_DATABASE_URL"))
	if dsn == "" {
		t.Skip("CM_TEST_DATABASE_URL is not set; PostgreSQL test database is required")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open postgres test db: %v", err)
	}
	return db
}
