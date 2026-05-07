package services

import (
	"testing"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/testutil"
	"gorm.io/gorm"
)

func setupMenuDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := testutil.OpenTestDB(t)
	if err := db.AutoMigrate(&models.ProjectObject{}, &models.MenuItem{}); err != nil {
		t.Fatalf("migrate schema: %v", err)
	}
	return db
}

func findMenuItemByPath(t *testing.T, db *gorm.DB, projectID string, path ...string) *models.MenuItem {
	t.Helper()
	parentID := ""
	var item models.MenuItem
	for _, title := range path {
		var current models.MenuItem
		if err := db.Model(&models.MenuItem{}).Where("project_id = ? AND parent_id = ? AND title = ?", projectID, parentID, title).First(&current).Error; err != nil {
			t.Fatalf("path %v not found at %q: %v", path, title, err)
		}
		item = current
		parentID = item.ID
	}
	return &item
}

func TestEnsureProjectMenuStructure_CreatesMVPHierarchy(t *testing.T) {
	db := setupMenuDB(t)
	projectID := "project-menu-1"
	if err := db.Create(&models.ProjectObject{ID: projectID, Name: "Тест"}).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}

	if err := EnsureDefaultProjectMenu(db, projectID); err != nil {
		t.Fatalf("ensure default menu: %v", err)
	}
	if err := EnsureProjectMenuStructure(db, projectID); err != nil {
		t.Fatalf("ensure menu structure: %v", err)
	}

	registryP := findMenuItemByPath(t, db, projectID, "Проектирование", "Стадия П", "Ведомость комплектов ПД")
	if registryP.ViewKey != "registryP" {
		t.Fatalf("expected registryP view key, got %q", registryP.ViewKey)
	}

	registryR := findMenuItemByPath(t, db, projectID, "Проектирование", "Стадия Р", "Ведомость комплектов РД")
	if registryR.ViewKey != "registryR" {
		t.Fatalf("expected registryR view key, got %q", registryR.ViewKey)
	}

	scheduleP := findMenuItemByPath(t, db, projectID, "Проектирование", "Стадия П", "График ПД")
	if scheduleP.ViewKey != "designSchedule" {
		t.Fatalf("expected designSchedule view key, got %q", scheduleP.ViewKey)
	}

	scheduleR := findMenuItemByPath(t, db, projectID, "Проектирование", "Стадия Р", "График РД")
	if scheduleR.ViewKey != "designScheduleR" {
		t.Fatalf("expected designScheduleR view key, got %q", scheduleR.ViewKey)
	}

	workforce := findMenuItemByPath(t, db, projectID, "СМР", "Учёт рабочих")
	if workforce.ViewKey != "workforceDaily" {
		t.Fatalf("expected workforceDaily view key, got %q", workforce.ViewKey)
	}

	protocol := findMenuItemByPath(t, db, projectID, "Протоколы совещаний", "СМР")
	if protocol.ViewKey != "protocolSMR" {
		t.Fatalf("expected protocolSMR view key, got %q", protocol.ViewKey)
	}
}
