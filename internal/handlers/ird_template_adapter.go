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

var validIrdDocTypes = map[string]bool{"GPZU": true, "TZ": true, "MTZ": true, "TU": true}

func validateIrdDateRange(issueDate, expiryDate string) error {
	if issueDate == "" || expiryDate == "" {
		return nil
	}
	issue, err := time.Parse("2006-01-02", issueDate)
	if err != nil {
		return fmt.Errorf("issue_date: используйте формат YYYY-MM-DD")
	}
	expiry, err := time.Parse("2006-01-02", expiryDate)
	if err != nil {
		return fmt.Errorf("expiry_date: используйте формат YYYY-MM-DD")
	}
	if expiry.Before(issue) {
		return fmt.Errorf("expiry_date не может быть раньше issue_date")
	}
	return nil
}

// irdColumns — колонки ИРД, жёстко заданные в коде.
// Не зависят от БД: шаблон всегда доступен на любой чистой базе.
var irdColumns = []gin.H{
	{"field_key": "doc_type", "title": "Тип документа", "data_type": "text", "sort_order": 1},
	{"field_key": "doc_number", "title": "Номер документа", "data_type": "text", "sort_order": 2},
	{"field_key": "issuer", "title": "Выдавший орган", "data_type": "text", "sort_order": 3},
	{"field_key": "issue_date", "title": "Дата выдачи", "data_type": "date", "sort_order": 4},
	{"field_key": "expiry_date", "title": "Срок действия", "data_type": "date", "sort_order": 5},
	{"field_key": "status", "title": "Статус", "data_type": "text", "sort_order": 6},
	{"field_key": "notes", "title": "Примечание", "data_type": "text", "sort_order": 7},
	{"field_key": "file_path", "title": "Файл/Ссылка", "data_type": "text", "sort_order": 8},
}

// GetIrdTemplate — GET /api/v1/templates/input_design_data
// Возвращает описание шаблона ИРД прямо из кода, не обращаясь к БД.
// Это гарантирует что вкладка ИРД работает на любой чистой базе данных.
func GetIrdTemplate() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"template": gin.H{
				"code":        "input_design_data",
				"name":        "ИРД — исходные данные для проектирования",
				"description": "ГПЗУ, ТЗ, ТУ, МТЗ и прочие исходные данные",
			},
			"columns": irdColumns,
		})
	}
}

// ListIrdAsTemplateRows — GET /api/v1/objects/:id/templates/input_design_data/rows
// Возвращает ИРД-документы в формате template-строк, который ожидает фронтенд.
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

		// Фильтрация по поиску
		search := strings.ToLower(strings.TrimSpace(c.Query("search")))
		if search != "" {
			filtered := make([]models.IrdDocument, 0, len(docs))
			for _, d := range docs {
				if strings.Contains(strings.ToLower(d.DocType), search) ||
					strings.Contains(strings.ToLower(d.DocNumber), search) ||
					strings.Contains(strings.ToLower(d.Issuer), search) ||
					strings.Contains(strings.ToLower(d.Notes), search) {
					filtered = append(filtered, d)
				}
			}
			docs = filtered
		}

		// Преобразуем IrdDocument → { id, data: {...} }
		// Фронтенд читает (row.data || {})[field_key]
		rows := make([]gin.H, 0, len(docs))
		for i, d := range docs {
			rows = append(rows, gin.H{
				"id":            d.ID,
				"project_id":    d.ProjectID,
				"template_code": "input_design_data",
				"row_number":    i + 1,
				"data": map[string]string{
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

		// Пагинация
		page := max(1, parseInt(c.Query("page"), 1))
		pageSize := min(200, max(1, parseInt(c.Query("page_size"), 200)))
		start := (page - 1) * pageSize
		if start > len(rows) {
			start = len(rows)
		}
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

// CreateIrdFromTemplateRow — POST /api/v1/objects/:id/templates/input_design_data/rows
// Создаёт ИРД-документ. Фронтенд шлёт { "data": { "doc_type": "...", ... } }
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
		if !validIrdDocTypes[docType] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid doc_type, must be GPZU, TZ, MTZ or TU"})
			return
		}

		status := strings.TrimSpace(input.Data["status"])
		if status == "" {
			status = "active"
		}

		// Обработка дат - только непустые значения
		issueDate := strings.TrimSpace(input.Data["issue_date"])
		expiryDate := strings.TrimSpace(input.Data["expiry_date"])

		// Преобразуем пустые строки в пустые значения для БД
		if issueDate == "" || issueDate == "null" {
			issueDate = ""
		} else {
			if _, err := time.Parse("2006-01-02", issueDate); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "issue_date: используйте формат YYYY-MM-DD"})
				return
			}
		}

		if expiryDate == "" || expiryDate == "null" {
			expiryDate = ""
		} else {
			if _, err := time.Parse("2006-01-02", expiryDate); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "expiry_date: используйте формат YYYY-MM-DD"})
				return
			}
		}
		if err := validateIrdDateRange(issueDate, expiryDate); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
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

		c.JSON(http.StatusCreated, gin.H{
			"id":            doc.ID,
			"project_id":    doc.ProjectID,
			"template_code": "input_design_data",
			"row_number":    1,
			"data": map[string]string{
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

// UpdateIrdFromTemplateRow — PUT /api/v1/ird-rows/:rowId
// Обновляет ИРД-документ. Фронтенд шлёт { "data": { ... } }
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
			if !validIrdDocTypes[v] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid doc_type, must be GPZU, TZ, MTZ or TU"})
				return
			}
			doc.DocType = v
		}
		if v, ok := input.Data["doc_number"]; ok {
			doc.DocNumber = strings.TrimSpace(v)
		}
		if v, ok := input.Data["issuer"]; ok {
			doc.Issuer = strings.TrimSpace(v)
		}
		if v, ok := input.Data["issue_date"]; ok {
			v = strings.TrimSpace(v)
			if v != "" {
				if _, err := time.Parse("2006-01-02", v); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "issue_date: используйте формат YYYY-MM-DD"})
					return
				}
			}
			doc.IssueDate = v
		}
		if v, ok := input.Data["expiry_date"]; ok {
			v = strings.TrimSpace(v)
			if v != "" {
				if _, err := time.Parse("2006-01-02", v); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "expiry_date: используйте формат YYYY-MM-DD"})
					return
				}
			}
			doc.ExpiryDate = v
		}
		if err := validateIrdDateRange(doc.IssueDate, doc.ExpiryDate); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if v := strings.TrimSpace(input.Data["status"]); v != "" {
			doc.Status = v
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

		c.JSON(http.StatusOK, gin.H{
			"id":            doc.ID,
			"project_id":    doc.ProjectID,
			"template_code": "input_design_data",
			"row_number":    1,
			"data": map[string]string{
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

// DeleteIrdAsTemplateRow — DELETE /api/v1/ird-rows/:rowId
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

// ImportIrdTemplateRows — POST /api/v1/objects/:id/templates/input_design_data/import
func ImportIrdTemplateRows(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		if projectID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "project_id is required"})
			return
		}
		var input struct {
			Mode string                   `json:"mode"`
			Rows []map[string]interface{} `json:"rows"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if len(input.Rows) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "rows is required"})
			return
		}
		mode := strings.ToLower(strings.TrimSpace(input.Mode))
		if mode == "" {
			mode = "upsert"
		}
		if mode != "add" && mode != "upsert" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "mode must be add or upsert"})
			return
		}

		type rowError struct {
			Index   int    `json:"index"`
			Message string `json:"message"`
		}
		errorsList := make([]rowError, 0)
		created, updated, skipped := 0, 0, 0

		existingDocs, err := repo.ListIrdDocuments(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		existingByKey := map[string]models.IrdDocument{}
		for _, doc := range existingDocs {
			key := strings.ToLower(strings.TrimSpace(doc.DocType + "|" + doc.DocNumber))
			if key != "|" {
				existingByKey[key] = doc
			}
		}

		for idx, raw := range input.Rows {
			data := map[string]string{}
			for k, v := range raw {
				data[k] = strings.TrimSpace(fmt.Sprint(v))
			}
			docType := strings.ToUpper(strings.TrimSpace(data["doc_type"]))
			if docType == "" {
				errorsList = append(errorsList, rowError{Index: idx + 1, Message: "doc_type is required"})
				continue
			}
			if !validIrdDocTypes[docType] {
				errorsList = append(errorsList, rowError{Index: idx + 1, Message: "invalid doc_type, must be GPZU, TZ, MTZ or TU"})
				continue
			}
			issueDate := strings.TrimSpace(data["issue_date"])
			expiryDate := strings.TrimSpace(data["expiry_date"])
			if issueDate != "" {
				if _, err := time.Parse("2006-01-02", issueDate); err != nil {
					errorsList = append(errorsList, rowError{Index: idx + 1, Message: "issue_date: используйте формат YYYY-MM-DD"})
					continue
				}
			}
			if expiryDate != "" {
				if _, err := time.Parse("2006-01-02", expiryDate); err != nil {
					errorsList = append(errorsList, rowError{Index: idx + 1, Message: "expiry_date: используйте формат YYYY-MM-DD"})
					continue
				}
			}
			status := strings.TrimSpace(data["status"])
			if status == "" {
				status = "active"
			}
			key := strings.ToLower(strings.TrimSpace(docType + "|" + strings.TrimSpace(data["doc_number"])))
			existing, hasExisting := existingByKey[key]
			if mode == "add" && hasExisting && key != "|" {
				skipped++
				continue
			}
			if mode == "upsert" && hasExisting && key != "|" {
				existing.DocType = docType
				existing.DocNumber = strings.TrimSpace(data["doc_number"])
				existing.Issuer = strings.TrimSpace(data["issuer"])
				existing.IssueDate = issueDate
				existing.ExpiryDate = expiryDate
				existing.Status = status
				existing.Notes = strings.TrimSpace(data["notes"])
				existing.FilePath = strings.TrimSpace(data["file_path"])
				if err := repo.UpdateIrdDocument(c.Request.Context(), &existing); err != nil {
					errorsList = append(errorsList, rowError{Index: idx + 1, Message: err.Error()})
					continue
				}
				updated++
				existingByKey[key] = existing
				continue
			}
			doc := &models.IrdDocument{
				ProjectID:  projectID,
				DocType:    docType,
				DocNumber:  strings.TrimSpace(data["doc_number"]),
				Issuer:     strings.TrimSpace(data["issuer"]),
				IssueDate:  issueDate,
				ExpiryDate: expiryDate,
				Status:     status,
				Notes:      strings.TrimSpace(data["notes"]),
				FilePath:   strings.TrimSpace(data["file_path"]),
			}
			if err := repo.CreateIrdDocument(c.Request.Context(), doc); err != nil {
				errorsList = append(errorsList, rowError{Index: idx + 1, Message: err.Error()})
				continue
			}
			created++
			if key != "|" {
				existingByKey[key] = *doc
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"created": created,
			"updated": updated,
			"skipped": skipped,
			"errors":  errorsList,
		})
	}
}
