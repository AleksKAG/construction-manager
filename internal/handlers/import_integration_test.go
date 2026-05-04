package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/AleksKAG/construction-manager/internal/testutil"
	"github.com/gin-gonic/gin"
)

func setupImportTestRepo(t *testing.T) repository.Repository {
	t.Helper()
	db := testutil.OpenTestDB(t)
	if err := db.AutoMigrate(&models.ProjectObject{}, &models.IrdDocument{}, &models.DocumentRegistry{}, &models.GanttTask{}); err != nil {
		t.Fatalf("migrate schema: %v", err)
	}
	return repository.NewGormRepository(db)
}

func performReq(r http.Handler, method, url string, body any) *httptest.ResponseRecorder {
	payload, _ := json.Marshal(body)
	req := httptest.NewRequest(method, url, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestImportIrdTemplateRows_RejectsInvalidDocType(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := setupImportTestRepo(t)
	project := models.ProjectObject{ID: "project-ird", Name: "IRD"}
	if err := repo.RawDB().Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}

	r := gin.New()
	r.POST("/api/v1/objects/:id/templates/input_design_data/import", ImportIrdTemplateRows(repo))

	resp := performReq(r, http.MethodPost, "/api/v1/objects/project-ird/templates/input_design_data/import", map[string]any{
		"mode": "upsert",
		"rows": []map[string]any{{
			"doc_type":   "CUSTOM_PERMIT",
			"doc_number": "CP-001",
			"status":     "active",
			"issuer":     "Комитет",
		}},
	})
	if resp.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%s", resp.Code, resp.Body.String())
	}

	var docs []models.IrdDocument
	if err := repo.RawDB().Where("project_id = ?", project.ID).Find(&docs).Error; err != nil {
		t.Fatalf("load docs: %v", err)
	}
	if len(docs) != 0 {
		t.Fatalf("expected no created docs for invalid doc_type, got %d", len(docs))
	}
}

func TestImportRegistryBatch_ThenUpsertSyncsScheduleTask(t *testing.T) {
	gin.SetMode(gin.TestMode)
	repo := setupImportTestRepo(t)
	project := models.ProjectObject{ID: "project-reg", Name: "Registry"}
	if err := repo.RawDB().Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}

	r := gin.New()
	r.POST("/api/v1/projects/:id/design/:stage/registry/import", ImportRegistryBatch(repo))
	r.POST("/api/v1/projects/:id/design/:stage/registry", UpsertRegistry(repo))

	importResp := performReq(r, http.MethodPost, "/api/v1/projects/project-reg/design/phase-p/registry/import", map[string]any{
		"mode": "add",
		"rows": []map[string]any{{"designation": "АР-101", "name": "Планы", "contractor": "ООО Подряд"}},
	})
	if importResp.Code != http.StatusOK {
		t.Fatalf("import status: %d body=%s", importResp.Code, importResp.Body.String())
	}

	upsertResp := performReq(r, http.MethodPost, "/api/v1/projects/project-reg/design/phase-p/registry", map[string]any{
		"designation":     "АР-101",
		"name":            "Планы",
		"contractor":      "ООО Подряд",
		"issue_date_fact": "2026-04-20",
	})
	if upsertResp.Code != http.StatusOK {
		t.Fatalf("upsert status: %d body=%s", upsertResp.Code, upsertResp.Body.String())
	}

	var row models.DocumentRegistry
	if err := repo.RawDB().First(&row, "project_id = ? AND stage = ? AND designation = ?", project.ID, "P", "АР-101").Error; err != nil {
		t.Fatalf("registry row: %v", err)
	}
	if row.LinkedTaskID == nil || *row.LinkedTaskID == "" {
		t.Fatalf("expected linked task id")
	}

	var task models.GanttTask
	if err := repo.RawDB().First(&task, "id = ?", *row.LinkedTaskID).Error; err != nil {
		t.Fatalf("linked task missing: %v", err)
	}
	if task.Source != "REGISTRY_P" {
		t.Fatalf("expected task source REGISTRY_P, got %q", task.Source)
	}
	if task.LinkedRegistryID == nil || *task.LinkedRegistryID != row.ID {
		t.Fatalf("expected reverse link to registry")
	}
}
