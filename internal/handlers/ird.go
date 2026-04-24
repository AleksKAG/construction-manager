package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

// ListIrdDocuments — список документов ИРД по проекту
func ListIrdDocuments(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		docs, err := repo.ListIrdDocuments(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Фильтрация по типу документа
		docType := strings.ToUpper(strings.TrimSpace(c.Query("doc_type")))
		if docType != "" {
			filtered := make([]models.IrdDocument, 0)
			for _, d := range docs {
				if strings.ToUpper(d.DocType) == docType {
					filtered = append(filtered, d)
				}
			}
			docs = filtered
		}

		// Поиск по номеру или наименованию
		search := strings.ToLower(strings.TrimSpace(c.Query("search")))
		if search != "" {
			filtered := make([]models.IrdDocument, 0)
			for _, d := range docs {
				if strings.Contains(strings.ToLower(d.DocNumber), search) ||
					strings.Contains(strings.ToLower(d.Issuer), search) ||
					strings.Contains(strings.ToLower(d.Notes), search) {
					filtered = append(filtered, d)
				}
			}
			docs = filtered
		}

		c.JSON(http.StatusOK, docs)
	}
}

// GetIrdDocument — получение документа ИРД по ID
func GetIrdDocument(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("irdId")
		doc, err := repo.GetIrdDocumentByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
			return
		}
		c.JSON(http.StatusOK, doc)
	}
}

// CreateIrdDocument — создание документа ИРД
func CreateIrdDocument(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		var input struct {
			DocType    string `json:"doc_type"`
			DocNumber  string `json:"doc_number"`
			IssueDate  string `json:"issue_date"`
			ExpiryDate string `json:"expiry_date"`
			Status     string `json:"status"`
			Issuer     string `json:"issuer"`
			Notes      string `json:"notes"`
			FilePath   string `json:"file_path"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Валидация типа документа
		validTypes := map[string]bool{"GPZU": true, "TZ": true, "MTZ": true, "TU": true}
		docType := strings.ToUpper(input.DocType)
		if !validTypes[docType] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid doc_type, must be GPZU, TZ, MTZ or TU"})
			return
		}

		// Валидация статуса
		validStatuses := map[string]bool{"draft": true, "active": true, "expired": true, "revoked": true}
		status := input.Status
		if status == "" {
			status = "active"
		}
		if !validStatuses[status] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
			return
		}

		// Валидация дат
		var issueDate, expiryDate time.Time
		var err error
		if input.IssueDate != "" {
			issueDate, err = time.Parse("2006-01-02", input.IssueDate)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid issue_date format, use YYYY-MM-DD"})
				return
			}
		}
		if input.ExpiryDate != "" {
			expiryDate, err = time.Parse("2006-01-02", input.ExpiryDate)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid expiry_date format, use YYYY-MM-DD"})
				return
			}
			if !issueDate.IsZero() && expiryDate.Before(issueDate) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "expiry_date must be after issue_date"})
				return
			}
		}

		doc := &models.IrdDocument{
			ProjectID:  projectID,
			DocType:    docType,
			DocNumber:  input.DocNumber,
			IssueDate:  nullIfEmpty(input.IssueDate),
			ExpiryDate: nullIfEmpty(input.ExpiryDate),
			Status:     status,
			Issuer:     input.Issuer,
			Notes:      input.Notes,
			FilePath:   input.FilePath,
		}

		if err := repo.CreateIrdDocument(c.Request.Context(), doc); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, doc)
	}
}

// UpdateIrdDocument — обновление документа ИРД
func UpdateIrdDocument(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("irdId")
		doc, err := repo.GetIrdDocumentByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
			return
		}

		var input struct {
			DocType    string `json:"doc_type"`
			DocNumber  string `json:"doc_number"`
			IssueDate  string `json:"issue_date"`
			ExpiryDate string `json:"expiry_date"`
			Status     string `json:"status"`
			Issuer     string `json:"issuer"`
			Notes      string `json:"notes"`
			FilePath   string `json:"file_path"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Обновляем только переданные поля
		if input.DocType != "" {
			validTypes := map[string]bool{"GPZU": true, "TZ": true, "MTZ": true, "TU": true}
			docType := strings.ToUpper(input.DocType)
			if !validTypes[docType] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid doc_type"})
				return
			}
			doc.DocType = docType
		}
		if input.DocNumber != "" {
			doc.DocNumber = input.DocNumber
		}
		if input.IssueDate != "" {
			doc.IssueDate = input.IssueDate
		}
		if input.ExpiryDate != "" {
			doc.ExpiryDate = input.ExpiryDate
		}
		if input.Status != "" {
			validStatuses := map[string]bool{"draft": true, "active": true, "expired": true, "revoked": true}
			if !validStatuses[input.Status] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
				return
			}
			doc.Status = input.Status
		}
		if input.Issuer != "" {
			doc.Issuer = input.Issuer
		}
		if input.Notes != "" {
			doc.Notes = input.Notes
		}
		if input.FilePath != "" {
			doc.FilePath = input.FilePath
		}

		if err := repo.UpdateIrdDocument(c.Request.Context(), doc); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, doc)
	}
}

// DeleteIrdDocument — удаление документа ИРД
func DeleteIrdDocument(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("irdId")
		if err := repo.DeleteIrdDocument(c.Request.Context(), id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "document deleted"})
	}
}

// nullIfEmpty returns empty string as "" -> "" stays "", but we need to return pointer or special handling
// For our case with TEXT columns that accept NULL, we convert empty strings to empty string
// which GORM will handle as NULL if the column is nullable
func nullIfEmpty(s string) string {
	if strings.TrimSpace(s) == "" {
		return ""
	}
	return s
}
