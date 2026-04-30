package handlers

import (
	"net/http"
	"strings"
	"testing"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/AleksKAG/construction-manager/internal/testutil"
	"github.com/gin-gonic/gin"
)

func TestGetAgentSummary_PartialAPIErrorsFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.OpenTestDB(t)
	if err := db.AutoMigrate(&models.ProjectObject{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	repo := repository.NewGormRepository(db)
	project := models.ProjectObject{ID: "project-ai", Name: "AI Project", Address: "Москва", Status: "active"}
	if err := repo.RawDB().Create(&project).Error; err != nil {
		t.Fatalf("seed project: %v", err)
	}

	r := gin.New()
	r.POST("/api/v1/agent/summary", GetAgentSummary(repo))
	resp := performJSONRequest(r, http.MethodPost, "/api/v1/agent/summary", map[string]any{"project_id": project.ID})
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", resp.Code, resp.Body.String())
	}
	body := resp.Body.String()
	if !containsAll(body, []string{"Ограничения данных", "TEP недоступен", "Проект: AI Project", "Критические риски"}) {
		t.Fatalf("unexpected body: %s", body)
	}
}

func containsAll(s string, parts []string) bool {
	for _, p := range parts {
		if !strings.Contains(s, p) {
			return false
		}
	}
	return true
}
