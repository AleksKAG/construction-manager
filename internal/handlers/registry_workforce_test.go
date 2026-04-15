package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupRegistryWorkforceTestRepo(t *testing.T) repository.Repository {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&models.ProjectObject{},
		&models.GanttTask{},
		&models.DocumentRegistry{},
		&models.WorkforceDailyRecord{},
	); err != nil {
		t.Fatalf("migrate schema: %v", err)
	}
	return repository.NewSQLiteRepository(db)
}

func performJSONRequest(r http.Handler, method, url string, body any) *httptest.ResponseRecorder {
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		payload, _ := json.Marshal(body)
		reader = bytes.NewReader(payload)
	}
	req := httptest.NewRequest(method, url, reader)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestUpsertRegistry_CreatesAndLinksTask(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := setupRegistryWorkforceTestRepo(t)

	project := models.ProjectObject{ID: "project-1", Name: "Test Project"}
	if err := repo.RawDB().Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}

	r := gin.New()
	r.POST("/api/v1/projects/:id/design/:stage/registry", UpsertRegistry(repo))
	r.GET("/api/v1/projects/:id/design/:stage/registry", ListRegistry(repo))

	resp := performJSONRequest(r, http.MethodPost, "/api/v1/projects/project-1/design/phase-p/registry", map[string]any{
		"designation":     "АР-01",
		"name":            "План этажа",
		"contractor":      "ООО Генподряд",
		"issue_date_fact": "2026-04-10",
	})
	if resp.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d, body: %s", resp.Code, resp.Body.String())
	}

	var row models.DocumentRegistry
	if err := json.Unmarshal(resp.Body.Bytes(), &row); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if row.Stage != "P" {
		t.Fatalf("expected stage P, got %q", row.Stage)
	}
	if row.LinkedTaskID == nil || *row.LinkedTaskID == "" {
		t.Fatalf("expected linked task id to be set")
	}
	if row.RevisionCount != 1 {
		t.Fatalf("expected revision_count=1 for issued row, got %d", row.RevisionCount)
	}

	var task models.GanttTask
	if err := repo.RawDB().First(&task, "id = ?", *row.LinkedTaskID).Error; err != nil {
		t.Fatalf("linked task not found: %v", err)
	}
	if task.Source != "REGISTRY_P" {
		t.Fatalf("expected task source REGISTRY_P, got %q", task.Source)
	}
	if task.LinkedRegistryID == nil || *task.LinkedRegistryID != row.ID {
		t.Fatalf("expected reverse linkage to registry row")
	}

	listResp := performJSONRequest(r, http.MethodGet, "/api/v1/projects/project-1/design/phase-p/registry", nil)
	if listResp.Code != http.StatusOK {
		t.Fatalf("unexpected list status: %d", listResp.Code)
	}
	var rows []models.DocumentRegistry
	if err := json.Unmarshal(listResp.Body.Bytes(), &rows); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
}

func TestCreateWorkforceRecord_ValidatesTaskProjectAndPersists(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := setupRegistryWorkforceTestRepo(t)

	project1 := models.ProjectObject{ID: "project-1", Name: "Project One"}
	project2 := models.ProjectObject{ID: "project-2", Name: "Project Two"}
	if err := repo.RawDB().Create(&project1).Error; err != nil {
		t.Fatalf("seed project1: %v", err)
	}
	if err := repo.RawDB().Create(&project2).Error; err != nil {
		t.Fatalf("seed project2: %v", err)
	}

	task := models.GanttTask{ID: "task-1", ObjectID: project1.ID, Name: "Монтаж"}
	foreignTask := models.GanttTask{ID: "task-2", ObjectID: project2.ID, Name: "Чужая задача"}
	if err := repo.RawDB().Create(&task).Error; err != nil {
		t.Fatalf("seed task: %v", err)
	}
	if err := repo.RawDB().Create(&foreignTask).Error; err != nil {
		t.Fatalf("seed foreign task: %v", err)
	}

	r := gin.New()
	r.POST("/api/v1/projects/:id/smr/workforce", CreateWorkforceRecord(repo))
	r.GET("/api/v1/projects/:id/smr/workforce", ListWorkforceByProject(repo))

	badResp := performJSONRequest(r, http.MethodPost, "/api/v1/projects/project-1/smr/workforce", map[string]any{
		"task_id":   foreignTask.ID,
		"work_date": "2026-04-11",
	})
	if badResp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for foreign task, got %d", badResp.Code)
	}

	okResp := performJSONRequest(r, http.MethodPost, "/api/v1/projects/project-1/smr/workforce", map[string]any{
		"task_id":     task.ID,
		"work_date":   "2026-04-12",
		"planned":     12,
		"actual":      10,
		"reported_by": "Мастер",
		"comment":     "Смена отработала без простоев",
	})
	if okResp.Code != http.StatusCreated {
		t.Fatalf("unexpected create status: %d, body: %s", okResp.Code, okResp.Body.String())
	}

	var created models.WorkforceDailyRecord
	if err := json.Unmarshal(okResp.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created record: %v", err)
	}
	if created.TaskID != task.ID {
		t.Fatalf("expected task_id %q, got %q", task.ID, created.TaskID)
	}
	if created.WorkDate.Format("2006-01-02") != "2026-04-12" {
		t.Fatalf("unexpected work date: %s", created.WorkDate.Format(time.DateOnly))
	}

	listResp := performJSONRequest(r, http.MethodGet, "/api/v1/projects/project-1/smr/workforce", nil)
	if listResp.Code != http.StatusOK {
		t.Fatalf("unexpected list status: %d", listResp.Code)
	}
	var rows []models.WorkforceDailyRecord
	if err := json.Unmarshal(listResp.Body.Bytes(), &rows); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 workforce row, got %d", len(rows))
	}
}
