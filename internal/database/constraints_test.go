package database

import (
	"testing"

	"github.com/AleksKAG/construction-manager/internal/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestEnsureApplicationConstraintsAddsProjectCodeUniqueness(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.Project{}); err != nil {
		t.Fatalf("auto migrate project: %v", err)
	}
	if err := EnsureApplicationConstraints(db); err != nil {
		t.Fatalf("ensure application constraints: %v", err)
	}

	first := models.Project{Code: "DUP", Name: "First"}
	second := models.Project{Code: "DUP", Name: "Second"}
	if err := db.Create(&first).Error; err != nil {
		t.Fatalf("create first project: %v", err)
	}
	if err := db.Create(&second).Error; err == nil {
		t.Fatal("expected duplicate project code to fail")
	}
}
