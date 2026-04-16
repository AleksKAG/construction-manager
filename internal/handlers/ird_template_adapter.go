package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

// ListIrdAsTemplateRows — адаптер: возвращает ИРД в формате, ожидаемом фронтендом
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

		// Фильтрация
		search := strings.ToLower(strings.TrimSpace(c.Query("search")))
		docType := strings.ToUpper(strings.TrimSpace(c.Query("doc_type")))
		
		if search != "" || docType != "" {
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

		// Преобразуем в формат ProjectTemplateRow
		rows := make([]gin.H, 0, len(docs))
		for i, d := range docs {
			values := map[string]string{
				"doc_type":    d.DocType,
				"doc_number":  d.DocNumber,
				"issue_date":  d.IssueDate,
				"expiry_date": d.ExpiryDate,
				"status":      d.Status,
				"issuer":      d.Issuer,
				"notes":       d.Notes,
				"file_path":   d.FilePath,
			}
			rows = append(rows, gin.H{
				"id":            d.ID,
				"project_id":    d.ProjectID,
				"template_code": "input_design_data",
				"row_number":    i + 1,
				"values_map":    values,
				"created_by":    "system",
				"created_at":    d.CreatedAt.Format(time.RFC3339),
				"updated_at":    d.UpdatedAt.Format(time.RFC3339),
			})
		}

		// Пагинация — используем существующие min/max/parseInt из templates.go
		page := max(1, parseInt(c.Query("page"), 1))
		pageSize := min(200, max(1, parseInt(c.Query("page_size"), 200)))
		start := (page - 1) * pageSize
		if start > len(rows) { start = len(rows) }
		end := min(len(rows), start+pageSize)

		c.JSON(http.StatusOK, gin.H{
			"data": rows[start:end],
			"pagination": gin.H{
				"page":      page,
				"page_size": pageSize,
				"total":     len(rows),
			},
		})
	}
}

// CreateIrdFromTemplateRow — создание
func CreateIrdFromTemplateRow(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		if projectID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "project_id is required"})
			return
		}

		var input struct {
			Data map[string]string `json:"data"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		docType := strings.ToUpper(strings.TrimSpace(input.Data["doc_type"]))
		if docType == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "doc_type is required"})
			return
		}
		validTypes := map[string]bool{"GPZU": true, "TZ": true, "MTZ": true, "TU": true}
		if !validTypes[docType] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid doc_type"})
			return
		}

		status := strings.TrimSpace(input.Data["status"])
		if status == "" { status = "active" }
		validStatuses := map[string]bool{"draft": true, "active": true, "expired": true, "revoked": true}
		if !validStatuses[status] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
			return
		}

		// Валидация дат
		issueDate := strings.TrimSpace(input.Data["issue_date"])
		expiryDate := strings.TrimSpace(input.Data["expiry_date"])
		if issueDate != "" {
			if _, err := time.Parse("2006-01-02", issueDate); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid issue_date format"})
				return
			}
		}
		if expiryDate != "" {
			if _, err := time.Parse("2006-01-02", expiryDate); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid expiry_date format"})
				return
			}
			if issueDate != "" && expiryDate < issueDate {
				c.JSON(http.StatusBadRequest, gin.H{"error": "expiry_date must be after issue_date"})
				return
			}
		}

		doc := &models.IrdDocument{
			ProjectID:  projectID,
			DocType:    docType,
			DocNumber:  strings.TrimSpace(input.Data["doc_number"]),
			IssueDate:  issueDate,
			ExpiryDate: expiryDate,
			Status:     status,
			Issuer:     strings.TrimSpace(input.Data["issuer"]),
			Notes:      strings.TrimSpace(input.Data["notes"]),
			FilePath:   strings.TrimSpace(input.Data["file_path"]),
		}

		if err := repo.CreateIrdDocument(c.Request.Context(), doc); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		values := map[string]string{
			"doc_type": doc.DocType, "doc_number": doc.DocNumber,
			"issue_date": doc.IssueDate, "expiry_date": doc.ExpiryDate,
			"status": doc.Status, "issuer": doc.Issuer,
			"notes": doc.Notes, "file_path": doc.FilePath,
		}
		c.JSON(http.StatusCreated, gin.H{
			"id":            doc.ID,
			"project_id":    doc.ProjectID,
			"template_code": "input_design_data",
			"row_number":    1,
			"values_map":    values,
			"created_by":    "system",
			"created_at":    doc.CreatedAt.Format(time.RFC3339),
			"updated_at":    doc.UpdatedAt.Format(time.RFC3339),
		})
	}
}

// UpdateIrdFromTemplateRow — обновление
func UpdateIrdFromTemplateRow(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		rowID := c.Param("rowId")
		if rowID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "row_id is required"})
			return
		}

		var input struct {
			Data map[string]string `json:"data"`
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

		// Обновляем только переданные поля
		if v := strings.TrimSpace(input.Data["doc_type"]); v != "" {
			v = strings.ToUpper(v)
			validTypes := map[string]bool{"GPZU": true, "TZ": true, "MTZ": true, "TU": true}
			if !validTypes[v] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid doc_type"})
				return
			}
			doc.DocType = v
		}
		if v, ok := input.Data["doc_number"]; ok {
			doc.DocNumber = strings.TrimSpace(v)
		}
		if v := strings.TrimSpace(input.Data["issue_date"]); v != "" {
			if _, err := time.Parse("2006-01-02", v); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid issue_date"})
				return
			}
			doc.IssueDate = v
		}
		if v := strings.TrimSpace(input.Data["expiry_date"]); v != "" {
			if _, err := time.Parse("2006-01-02", v); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid expiry_date"})
				return
			}
			if doc.IssueDate != "" && v < doc.IssueDate {
				c.JSON(http.StatusBadRequest, gin.H{"error": "expiry_date must be after issue_date"})
				return
			}
			doc.ExpiryDate = v
		}
		if v := strings.TrimSpace(input.Data["status"]); v != "" {
			validStatuses := map[string]bool{"draft": true, "active": true, "expired": true, "revoked": true}
			if !validStatuses[v] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
				return
			}
			doc.Status = v
		}
		if v, ok := input.Data["issuer"]; ok {
			doc.Issuer = strings.TrimSpace(v)
		}
		if v, ok := input.Data["notes"]; ok {
			doc.Notes = strings.TrimSpace(v)
		}
		if v, ok := input.Data["file_path"]; ok {
			doc.FilePath = strings.TrimSpace(v)
		}

		if err := repo.UpdateIrdDocument(c.Request.Context(), doc); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		values := map[string]string{
			"doc_type": doc.DocType, "doc_number": doc.DocNumber,
			"issue_date": doc.IssueDate, "expiry_date": doc.ExpiryDate,
			"status": doc.Status, "issuer": doc.Issuer,
			"notes": doc.Notes, "file_path": doc.FilePath,
		}
		c.JSON(http.StatusOK, gin.H{
			"id": doc.ID,
			"project_id": doc.ProjectID,
			"template_code": "input_design_data",
			"row_number": 1,
			"values_map": values,
			"updated_at": doc.UpdatedAt.Format(time.RFC3339),
		})
	}
}

// DeleteIrdAsTemplateRow — удаление
func DeleteIrdAsTemplateRow(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		rowID := c.Param("rowId")
		if err := repo.DeleteIrdDocument(c.Request.Context(), rowID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "deleted"})
	}
}

