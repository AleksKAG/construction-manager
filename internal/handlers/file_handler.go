package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/services"
	"github.com/gin-gonic/gin"
)

// FileHandler — хендлеры для FMS (File Management System)
type FileHandler struct {
	service *services.FileService
}

func NewFileHandler(service *services.FileService) *FileHandler {
	return &FileHandler{service: service}
}

// GetTree godoc
// GET /api/v1/files/tree?project_id=xxx&path=/docs
func (h *FileHandler) GetTree(c *gin.Context) {
	projectID := c.Query("project_id")
	if projectID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "project_id is required"})
		return
	}
	path := c.DefaultQuery("path", "/")
	nodes, err := h.service.GetTree(c.Request.Context(), projectID, path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if nodes == nil {
		c.JSON(http.StatusOK, []gin.H{})
		return
	}
	c.JSON(http.StatusOK, nodes)
}

// ListFiles godoc
// GET /api/v1/files?project_id=xxx&path=/docs
func (h *FileHandler) ListFiles(c *gin.Context) {
	projectID := c.Query("project_id")
	if projectID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "project_id is required"})
		return
	}
	path := c.DefaultQuery("path", "/")
	files, err := h.service.ListFiles(c.Request.Context(), projectID, path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, files)
}

// CreateFolder godoc
// POST /api/v1/files/folders
func (h *FileHandler) CreateFolder(c *gin.Context) {
	var req struct {
		ProjectID  string `json:"project_id" binding:"required"`
		ParentPath string `json:"parent_path"`
		Name       string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	folder, err := h.service.CreateFolder(c.Request.Context(), req.ProjectID, req.ParentPath, req.Name, c.GetString("user_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, folder)
}

// MoveFolder godoc
// PATCH /api/v1/files/folders/move
func (h *FileHandler) MoveFolder(c *gin.Context) {
	var req struct {
		ProjectID     string `json:"project_id" binding:"required"`
		FolderPath    string `json:"folder_path" binding:"required"`
		NewParentPath string `json:"new_parent_path" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.MoveFolder(c.Request.Context(), req.ProjectID, req.FolderPath, req.NewParentPath); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// RequestUpload godoc
// POST /api/v1/files/upload
func (h *FileHandler) RequestUpload(c *gin.Context) {
	var req struct {
		ProjectID      string `json:"project_id" binding:"required"`
		Name           string `json:"name" binding:"required"`
		ContentType    string `json:"content_type"`
		Size           int64  `json:"size"`
		IdempotencyKey string `json:"idempotency_key"`
		Designation    string `json:"designation"`
		TargetRegistry string `json:"target_registry"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.ContentType == "" {
		req.ContentType = "application/octet-stream"
	}

	result, err := h.service.RequestUpload(c.Request.Context(), req.ProjectID, req.Name, req.ContentType, req.Size, req.IdempotencyKey, req.Designation, req.TargetRegistry)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// StreamEvents godoc
// GET /api/v1/files/events/:id  — SSE статус AI-анализа
func (h *FileHandler) StreamEvents(c *gin.Context) {
	fileID := c.Param("id")
	if fileID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file id is required"})
		return
	}

	// Обновляем статус на "analyzing"
	_ = h.service.SetStatus(c.Request.Context(), fileID, "analyzing")

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	c.Stream(func(w io.Writer) bool {
		// Mock AI-анализ: через 2 секунды отправляем результат
		timer := time.NewTimer(2 * time.Second)
		defer timer.Stop()

		select {
		case <-c.Request.Context().Done():
			return false
		case <-timer.C:
			aiResult := map[string]any{
				"confidence":            0.85,
				"suggested_folder":      "/documents/stage-p",
				"version_action":        "new",
				"explanation_for_user":  "Документ распознан как проектная документация. Рекомендуется разместить в папке /documents/stage-p.",
				"requires_human_review": true,
			}
			data, _ := json.Marshal(aiResult)

			// Обновляем статус на requires_confirmation
			aiMeta := map[string]any{
				"confidence":            0.85,
				"suggested_folder":      "/documents/stage-p",
				"version_action":        "new",
				"explanation_for_user":  "Документ распознан как проектная документация. Рекомендуется разместить в папке /documents/stage-p.",
				"requires_human_review": true,
			}
			_ = h.service.SetStatus(c.Request.Context(), fileID, "requires_confirmation")
			_ = h.service.SetAIMeta(c.Request.Context(), fileID, aiMeta)

			sseMsg := fmt.Sprintf("event: analysis_ready\ndata: %s\n\n", string(data))
			fmt.Fprint(w, sseMsg)
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
			return false
		}
	})
}

// ConfirmUpload godoc
// POST /api/v1/files/:id/confirm
func (h *FileHandler) ConfirmUpload(c *gin.Context) {
	fileID := c.Param("id")
	if fileID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file id is required"})
		return
	}
	var req struct {
		Action     string `json:"action"`      // new | update | archive
		FolderPath string `json:"folder_path"` // куда сохранить
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Action == "" {
		req.Action = "new"
	}

	file, err := h.service.ConfirmUpload(c.Request.Context(), fileID, req.Action, req.FolderPath)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, file)
}

// GetVersions godoc
// GET /api/v1/files/:id/versions
func (h *FileHandler) GetVersions(c *gin.Context) {
	fileID := c.Param("id")
	if fileID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file id is required"})
		return
	}
	versions, err := h.service.GetVersions(c.Request.Context(), fileID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, versions)
}

// MoveFile godoc
// PATCH /api/v1/files/:id/move
func (h *FileHandler) MoveFile(c *gin.Context) {
	fileID := c.Param("id")
	if fileID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file id is required"})
		return
	}
	var req struct {
		NewPath string `json:"new_path" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.NewPath = strings.TrimSpace(req.NewPath)
	if req.NewPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "new_path is required"})
		return
	}

	if err := h.service.MoveFile(c.Request.Context(), fileID, req.NewPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "new_path": req.NewPath})
}

// DeleteFile godoc
// DELETE /api/v1/files/:id?hard=true
func (h *FileHandler) DeleteFile(c *gin.Context) {
	fileID := c.Param("id")
	if fileID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file id is required"})
		return
	}
	hard := strings.EqualFold(c.Query("hard"), "true")
	if err := h.service.DeleteFile(c.Request.Context(), fileID, hard); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "hard": hard})
}
