package testutil

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// OpenTestDB opens PostgreSQL when CM_TEST_DATABASE_URL is provided.
// Falls back to in-memory SQLite for local fast unit runs.
func OpenTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	if dsn := strings.TrimSpace(os.Getenv("CM_TEST_DATABASE_URL")); dsn != "" {
		db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err != nil {
			t.Fatalf("open postgres test db: %v", err)
		}
		return db
	}

	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite test db: %v", err)
	}
	return db
}
