// internal/handlers/ird_template_adapter.go
package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

// ListIrdAsTemplateRows — адаптер: возвращает ИРД в формате, ожидаемом фронтендом (система шаблонов)
// GET /api/v1/objects/:id/templates/input_design_data/rows
func ListIrdAsTemplateRows(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		if projectID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "project_id is required"})
			return
		}

		docs, err := repo.ListIrdDocuments(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Фильтрация по query-параметрам (совместимость с общим списком шаблонов)
		docType := strings.ToUpper(strings.TrimSpace(c.Query("doc_type")))
		search := strings.ToLower(strings.TrimSpace(c.Query("search")))

		if docType != "" || search != "" {
			filtered := make([]models.IrdDocument, 0, len(docs))
			for _, d := range docs {
				if docType != "" && strings.ToUpper(d.DocType) != docType {
					continue
				}
				if search != "" {
					if !strings.Contains(strings.ToLower(d.DocNumber), search) &&
						!strings.Contains(strings.ToLower(d.Issuer), search) &&
						!strings.Contains(strings.ToLower(d.Notes), search) {
						continue
					}
				}
				filtered = append(filtered, d)
			}
			docs = filtered
		}

		// Преобразуем в формат { id, data: {...}, row_number }
		rows := make([]gin.H, 0, len(docs))
		for i, d := range docs {
			rows = append(rows, gin.H{
				"id":         d.ID,
				"row_number": i + 1,
				"data": gin.H{
					"doc_type":    d.DocType,
					"doc_number":  d.DocNumber,
					"issue_date":  d.IssueDate,
					"expiry_date": d.ExpiryDate,
					"status":      d.Status,
					"issuer":      d.Issuer,
					"notes":       d.Notes,
					"file_path":   d.FilePath,
				},
				"created_at": d.CreatedAt.Format(time.RFC3339),
				"updated_at": d.UpdatedAt.Format(time.RFC3339),
			})
		}

		// Пагинация (фронтенд запрашивает page_size=200 для ИРД)
		page := 1
		if p := c.Query("page"); p != "" {
			if _, err := fmt.Sscanf(p, "%d", &page); err != nil {
				page = 1
			}
		}
		pageSize := 200 // default for IRD
		if ps := c.Query("page_size"); ps != "" {
			if _, err := fmt.Sscanf(ps, "%d", &pageSize); err != nil {
				pageSize = 200
			}
		}

		total := len(rows)
		start := (page - 1) * pageSize
		end := start + pageSize
		if start > total {
			start = total
		}
		if end > total {
			end = total
		}

		c.JSON(http.StatusOK, gin.H{
			"data": rows[start:end],
			"pagination": gin.H{
				"page":      page,
				"page_size": pageSize,
				"total":     total,
			},
		})
	}
}

// CreateIrdFromTemplateRow — адаптер создания ИРД из формата шаблона
// POST /api/v1/objects/:id/templates/input_design_data/rows
func CreateIrdFromTemplateRow(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		if projectID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "project_id is required"})
			return
		}

		var input struct {
			Data map[string]interface{} `json:"data"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Валидация обязательных полей
		docType := getString(input.Data, "doc_type")
		if docType == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "doc_type is required"})
			return
		}
		docType = strings.ToUpper(docType)
		validTypes := map[string]bool{"GPZU": true, "TZ": true, "MTZ": true, "TU": true}
		if !validTypes[docType] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid doc_type, must be GPZU, TZ, MTZ or TU"})
			return
		}

		// Валидация статуса
		status := getString(input.Data, "status", "active")
		validStatuses := map[string]bool{"draft": true, "active": true, "expired": true, "revoked": true}
		if !validStatuses[status] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
			return
		}

		// Валидация дат
		issueDate := getString(input.Data, "issue_date")
		expiryDate := getString(input.Data, "expiry_date")
		if issueDate != "" && !isValidDate(issueDate) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid issue_date format, use YYYY-MM-DD"})
			return
		}
		if expiryDate != "" && !isValidDate(expiryDate) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid expiry_date format, use YYYY-MM-DD"})
			return
		}
		if issueDate != "" && expiryDate != "" && expiryDate < issueDate {
			c.JSON(http.StatusBadRequest, gin.H{"error": "expiry_date must be after issue_date"})
			return
		}

		doc := &models.IrdDocument{
			ProjectID:  projectID,
			DocType:    docType,
			DocNumber:  getString(input.Data, "doc_number"),
			IssueDate:  issueDate,
			ExpiryDate: expiryDate,
			Status:     status,
			Issuer:     getString(input.Data, "issuer"),
			Notes:      getString(input.Data, "notes"),
			FilePath:   getString(input.Data, "file_path"),
		}

		if err := repo.CreateIrdDocument(c.Request.Context(), doc); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"id":         doc.ID,
			"row_number": 1,
			"data": map[string]interface{}{
				"doc_type":    doc.DocType,
				"doc_number":  doc.DocNumber,
				"issue_date":  doc.IssueDate,
				"expiry_date": doc.ExpiryDate,
				"status":      doc.Status,
				"issuer":      doc.Issuer,
				"notes":       doc.Notes,
				"file_path":   doc.FilePath,
			},
			"created_at": doc.CreatedAt.Format(time.RFC3339),
			"updated_at": doc.UpdatedAt.Format(time.RFC3339),
		})
	}
}

// UpdateIrdFromTemplateRow — адаптер обновления ИРД из формата шаблона
// PUT /api/v1/template-rows/:rowId
func UpdateIrdFromTemplateRow(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		rowID := c.Param("rowId")
		if rowID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "row_id is required"})
			return
		}

		var input struct {
			Data map[string]interface{} `json:"data"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		doc, err := repo.GetIrdDocumentByID(c.Request.Context(), rowID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
			return
		}

		// Обновляем только переданные поля из data.*
		if v := getString(input.Data, "doc_type"); v != "" {
			v = strings.ToUpper(v)
			validTypes := map[string]bool{"GPZU": true, "TZ": true, "MTZ": true, "TU": true}
			if !validTypes[v] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid doc_type"})
				return
			}
			doc.DocType = v
		}
		if v, ok := input.Data["doc_number"].(string); ok {
			doc.DocNumber = v
		}
		if v := getString(input.Data, "issue_date"); v != "" {
			if !isValidDate(v) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid issue_date format"})
				return
			}
			doc.IssueDate = v
		}
		if v := getString(input.Data, "expiry_date"); v != "" {
			if !isValidDate(v) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid expiry_date format"})
				return
			}
			if doc.IssueDate != "" && v < doc.IssueDate {
				c.JSON(http.StatusBadRequest, gin.H{"error": "expiry_date must be after issue_date"})
				return
			}
			doc.ExpiryDate = v
		}
		if v := getString(input.Data, "status"); v != "" {
			validStatuses := map[string]bool{"draft": true, "active": true, "expired": true, "revoked": true}
			if !validStatuses[v] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
				return
			}
			doc.Status = v
		}
		if v, ok := input.Data["issuer"].(string); ok {
			doc.Issuer = v
		}
		if v, ok := input.Data["notes"].(string); ok {
			doc.Notes = v
		}
		if v, ok := input.Data["file_path"].(string); ok {
			doc.FilePath = v
		}

		if err := repo.UpdateIrdDocument(c.Request.Context(), doc); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"id": doc.ID,
			"data": map[string]interface{}{
				"doc_type":    doc.DocType,
				"doc_number":  doc.DocNumber,
				"issue_date":  doc.IssueDate,
				"expiry_date": doc.ExpiryDate,
				"status":      doc.Status,
				"issuer":      doc.Issuer,
				"notes":       doc.Notes,
				"file_path":   doc.FilePath,
			},
			"updated_at": doc.UpdatedAt.Format(time.RFC3339),
		})
	}
}

// DeleteIrdAsTemplateRow — адаптер удаления ИРД
// DELETE /api/v1/template-rows/:rowId
func DeleteIrdAsTemplateRow(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		rowID := c.Param("rowId")
		if rowID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "row_id is required"})
			return
		}

		if err := repo.DeleteIrdDocument(c.Request.Context(), rowID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "deleted"})
	}
}

// isValidDate проверяет формат даты YYYY-MM-DD
func isValidDate(s string) bool {
	if s == "" {
		return true
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

// getString безопасно извлекает строку из map, возвращая значение по умолчанию если не найдено
func getString(m map[string]interface{}, key string, def ...string) string {
	if v, ok := m[key].(string); ok {
		return strings.TrimSpace(v)
	}
	if len(def) > 0 {
		return def[0]
	}
	return ""
}