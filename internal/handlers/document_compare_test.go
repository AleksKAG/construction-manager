package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/services"
	"github.com/gin-gonic/gin"
)

type compareRepoStub struct{}

func (c *compareRepoStub) Create(*models.Document) error                  { return nil }
func (c *compareRepoStub) GetByID(string) (*models.Document, error)       { return nil, nil }
func (c *compareRepoStub) GetByProject(string) ([]models.Document, error) { return nil, nil }
func (c *compareRepoStub) GetByDesignation(string, string) ([]models.Document, error) {
	return []models.Document{{ID: "1", Version: 2, StorageKey: "k", FileHash: []byte{0xAA}, Status: models.StatusDraft}}, nil
}
func (c *compareRepoStub) CreateVersion(documentID string, version int, storageKey string, fileHash []byte) error {
	return nil
}
func (c *compareRepoStub) LogChange(documentID, changeType string, payload map[string]any) error {
	return nil
}

func TestCompareVersions_ReturnsHexHash(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	svc := services.NewDocumentService(nil, &compareRepoStub{})
	h := NewDocumentHandler(svc)
	r.POST("/compare", h.CompareVersions)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/compare", bytes.NewBufferString(`{"project_id":"p","designation":"d"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var out []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil || len(out) != 1 || out[0]["file_hash"] != "aa" {
		t.Fatalf("unexpected response: %s", w.Body.String())
	}
}
