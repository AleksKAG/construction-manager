package handlers

import (
	"net/http"

	"github.com/AleksKAG/construction-manager/internal/services"
	"github.com/gin-gonic/gin"
)

type DocumentHandler struct{ service *services.DocumentService }

func NewDocumentHandler(service *services.DocumentService) *DocumentHandler {
	return &DocumentHandler{service: service}
}
func (h *DocumentHandler) RequestPresignedURL(c *gin.Context) {
	var req struct {
		ProjectID   string `json:"project_id" binding:"required"`
		DocType     string `json:"doc_type" binding:"required,oneof=ird pd rd estimate protocol act"`
		Designation string `json:"designation" binding:"required,max=100"`
		Filename    string `json:"filename" binding:"required,max=255"`
		ContentType string `json:"content_type" binding:"required,max=100"`
		Size        int64  `json:"size" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.service.RequestPresignedURL(c.Request.Context(), req.ProjectID, req.DocType, req.Designation, req.Filename, req.ContentType, req.Size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}
func (h *DocumentHandler) ConfirmUpload(c *gin.Context) {
	var req struct {
		StorageKey string `json:"storage_key" binding:"required"`
		FileHash   string `json:"file_hash" binding:"required,len=64,hexadecimal"`
		Size       int64  `json:"size" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	doc, err := h.service.ConfirmUpload(c.Request.Context(), req.StorageKey, req.FileHash, req.Size)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"id":          doc.ID,
		"project_id":  doc.ProjectID,
		"doc_type":    doc.DocType,
		"designation": doc.Designation,
		"version":     doc.Version,
		"storage_key": doc.StorageKey,
		"status":      doc.Status,
	})
}
func (h *DocumentHandler) GetDownloadURL(c *gin.Context) {
	id := c.Query("document_id")
	url, err := h.service.GetDownloadURL(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"url": url})
}
func (h *DocumentHandler) CompareVersions(c *gin.Context) {
	var req struct {
		ProjectID   string `json:"project_id" binding:"required"`
		Designation string `json:"designation" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	docs, err := h.service.CompareVersions(c.Request.Context(), req.ProjectID, req.Designation)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	type compareItem struct {
		ID         string `json:"id"`
		Version    int    `json:"version"`
		StorageKey string `json:"storage_key"`
		FileHash   string `json:"file_hash"`
		Status     string `json:"status"`
	}
	out := make([]compareItem, 0, len(docs))
	for _, d := range docs {
		out = append(out, compareItem{
			ID:         d.ID,
			Version:    d.Version,
			StorageKey: d.StorageKey,
			FileHash:   services.FileHashHex(d.FileHash),
			Status:     string(d.Status),
		})
	}
	c.JSON(http.StatusOK, out)
}
