package services

import (
	"context"
	"testing"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/sirupsen/logrus"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTemplateSeedDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.TemplateDefinition{}, &models.TemplateColumn{}); err != nil {
		t.Fatalf("migrate template schema: %v", err)
	}
	return db
}

func TestLoadStandardTemplatesAddsMissingScheduleTemplatesWhenLegacyTemplatesExist(t *testing.T) {
	db := setupTemplateSeedDB(t)
	if err := db.Create(&models.TemplateDefinition{Code: "schedule", Name: "Legacy график", Description: "old migration"}).Error; err != nil {
		t.Fatalf("seed legacy template: %v", err)
	}
	if err := db.Create(&models.TemplateDefinition{Code: "tep", Name: "Старое имя", Description: "old"}).Error; err != nil {
		t.Fatalf("seed tep template: %v", err)
	}

	repo := repository.NewGormRepository(db)
	logger := logrus.New()
	logger.SetOutput(testingWriter{t: t})
	if err := LoadStandardTemplates(repo, logger); err != nil {
		t.Fatalf("load standard templates: %v", err)
	}

	for _, code := range []string{"design_schedule", "smr_schedule", "summary_estimate", "input_design_data", "tep", "docs"} {
		if _, _, err := repo.GetTemplateByCode(context.Background(), code); err != nil {
			t.Fatalf("expected template %q to be available after seeding: %v", code, err)
		}
	}

	var designColumnCount int64
	if err := db.Model(&models.TemplateColumn{}).Where("template_code = ?", "design_schedule").Count(&designColumnCount).Error; err != nil {
		t.Fatalf("count design schedule columns: %v", err)
	}
	if designColumnCount == 0 {
		t.Fatal("expected design_schedule columns to be created")
	}

	var smrColumnCount int64
	if err := db.Model(&models.TemplateColumn{}).Where("template_code = ?", "smr_schedule").Count(&smrColumnCount).Error; err != nil {
		t.Fatalf("count smr schedule columns: %v", err)
	}
	if smrColumnCount == 0 {
		t.Fatal("expected smr_schedule columns to be created")
	}
}

type testingWriter struct {
	t *testing.T
}

func (w testingWriter) Write(p []byte) (int, error) {
	w.t.Helper()
	w.t.Logf("%s", p)
	return len(p), nil
}
