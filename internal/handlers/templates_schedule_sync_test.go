package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupScheduleTemplateSyncRepo(t *testing.T) repository.Repository {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&models.ProjectObject{},
		&models.TemplateDefinition{},
		&models.TemplateColumn{},
		&models.ProjectTemplateRow{},
		&models.DocumentRegistry{},
		&models.GanttTask{},
	); err != nil {
		t.Fatalf("migrate schema: %v", err)
	}
	return repository.NewGormRepository(db)
}

func seedDesignScheduleTemplate(t *testing.T, repo repository.Repository) {
	t.Helper()
	if err := repo.RawDB().Create(&models.TemplateDefinition{Code: "design_schedule", Name: "График разработки проектной документации"}).Error; err != nil {
		t.Fatalf("seed template: %v", err)
	}
	columns := []models.TemplateColumn{
		{TemplateCode: "design_schedule", FieldKey: "volume_no", Title: "№ тома", SortOrder: 1},
		{TemplateCode: "design_schedule", FieldKey: "code", Title: "Обозначение", SortOrder: 2},
		{TemplateCode: "design_schedule", FieldKey: "name", Title: "Наименование", SortOrder: 3},
		{TemplateCode: "design_schedule", FieldKey: "executor", Title: "Исполнитель", SortOrder: 4},
		{TemplateCode: "design_schedule", FieldKey: "baseline_start", Title: "Дата начала базовая", DataType: "date", SortOrder: 5},
		{TemplateCode: "design_schedule", FieldKey: "baseline_end", Title: "Дата выдачи базовая", DataType: "date", SortOrder: 6},
		{TemplateCode: "design_schedule", FieldKey: "progress", Title: "% завершения", DataType: "number", SortOrder: 7},
	}
	if err := repo.RawDB().Create(&columns).Error; err != nil {
		t.Fatalf("seed columns: %v", err)
	}
}

func TestListTemplateRowsSyncsDesignScheduleFromRegistry(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := setupScheduleTemplateSyncRepo(t)
	seedDesignScheduleTemplate(t, repo)
	projectID := "project-sync"
	if err := repo.RawDB().Create(&models.ProjectObject{ID: projectID, Name: "Sync"}).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	volume := 7
	task := models.GanttTask{ObjectID: projectID, Name: "АР — Архитектурные решения", StartDate: "2026-02-01", EndDate: "2026-02-20", Duration: 19, Progress: 45, Source: "REGISTRY_P"}
	if err := repo.RawDB().Create(&task).Error; err != nil {
		t.Fatalf("seed task: %v", err)
	}
	registry := models.DocumentRegistry{ProjectID: projectID, Stage: "P", VolumeNumber: &volume, Designation: "АР", Name: "Архитектурные решения", Contractor: "ООО Проект", LinkedTaskID: &task.ID}
	if err := repo.RawDB().Create(&registry).Error; err != nil {
		t.Fatalf("seed registry: %v", err)
	}

	r := gin.New()
	r.GET("/objects/:id/templates/:code/rows", ListTemplateRows(repo))
	resp := performReq(r, http.MethodGet, "/objects/project-sync/templates/design_schedule/rows?schedule_stage=P", nil)
	if resp.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", resp.Code, resp.Body.String())
	}

	var payload struct {
		Data []models.ProjectTemplateRow `json:"data"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.Data) != 1 {
		t.Fatalf("expected one synced row, got %d", len(payload.Data))
	}
	data := payload.Data[0].ValuesMap
	if data["schedule_stage"] != "P" || data["code"] != "АР" || data["name"] != "Архитектурные решения" {
		t.Fatalf("unexpected synced data: %#v", data)
	}
	if data["baseline_start"] != "2026-02-01" || data["baseline_end"] != "2026-02-20" || data["progress"] != "45" {
		t.Fatalf("expected task dates/progress in synced row, got %#v", data)
	}
}

func TestListTemplateRowsFallsBackToDesignTasksWhenRegistryIsEmpty(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := setupScheduleTemplateSyncRepo(t)
	seedDesignScheduleTemplate(t, repo)
	projectID := "project-task-fallback"
	if err := repo.RawDB().Create(&models.ProjectObject{ID: projectID, Name: "Task fallback"}).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}
	if err := repo.RawDB().Create(&models.GanttTask{ObjectID: projectID, Name: "ПЗ — Пояснительная записка", StartDate: "2026-03-01", EndDate: "2026-03-15", Progress: 70, Status: "design"}).Error; err != nil {
		t.Fatalf("seed task: %v", err)
	}

	r := gin.New()
	r.GET("/objects/:id/templates/:code/rows", ListTemplateRows(repo))
	resp := performReq(r, http.MethodGet, "/objects/project-task-fallback/templates/design_schedule/rows?schedule_stage=P", nil)
	if resp.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", resp.Code, resp.Body.String())
	}

	var payload struct {
		Data []models.ProjectTemplateRow `json:"data"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.Data) != 1 {
		t.Fatalf("expected one fallback row, got %d", len(payload.Data))
	}
	if payload.Data[0].ValuesMap["code"] != "ПЗ" || payload.Data[0].ValuesMap["schedule_stage"] != "P" {
		t.Fatalf("unexpected fallback data: %#v", payload.Data[0].ValuesMap)
	}
}
