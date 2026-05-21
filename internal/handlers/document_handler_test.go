package handlers

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/AleksKAG/construction-manager/internal/services"
	"github.com/gin-gonic/gin"
)

func TestConfirmUpload_Validation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewDocumentHandler(&services.DocumentService{})
	r.POST("/confirm", h.ConfirmUpload)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/confirm", bytes.NewBufferString(`{"storage_key":"x","file_hash":"123","size":1}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}
