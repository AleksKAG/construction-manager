package handlers

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

func ListTemplates(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		templates, err := repo.ListTemplateDefinitions(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		search := strings.ToLower(strings.TrimSpace(c.Query("search")))
		if search == "" {
			c.JSON(http.StatusOK, templates)
			return
		}
		filtered := make([]models.TemplateDefinition, 0, len(templates))
		for _, t := range templates {
			if strings.Contains(strings.ToLower(t.Code), search) || strings.Contains(strings.ToLower(t.Name), search) {
				filtered = append(filtered, t)
			}
		}
		c.JSON(http.StatusOK, filtered)
	}
}

func GetTemplate(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		code := c.Param("code")
		template, columns, err := repo.GetTemplateByCode(c.Request.Context(), code)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"template": template, "columns": columns})
	}
}

func ListTemplateRows(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		code := c.Param("code")

		rows, err := repo.ListTemplateRows(c.Request.Context(), projectID, code)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		search := strings.ToLower(strings.TrimSpace(c.Query("search")))
		filtered := make([]models.ProjectTemplateRow, 0, len(rows))
		for _, row := range rows {
			if search == "" || matchesRowSearch(row, search) {
				filtered = append(filtered, row)
			}
		}

		page := max(1, parseInt(c.Query("page"), 1))
		pageSize := min(200, max(1, parseInt(c.Query("page_size"), 20)))
		start := (page - 1) * pageSize
		if start > len(filtered) {
			start = len(filtered)
		}
		end := min(len(filtered), start+pageSize)

		c.JSON(http.StatusOK, gin.H{
			"data": filtered[start:end],
			"pagination": gin.H{
				"page":      page,
				"page_size": pageSize,
				"total":     len(filtered),
			},
		})
	}
}

func CreateTemplateRow(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		code := c.Param("code")
		var input struct {
			Data map[string]string `json:"data"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		_, columns, err := repo.GetTemplateByCode(c.Request.Context(), code)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}
		if err := validateTemplateData(columns, input.Data); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		currentRows, err := repo.ListTemplateRows(c.Request.Context(), projectID, code)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		row := &models.ProjectTemplateRow{ProjectID: projectID, TemplateCode: code, RowNumber: len(currentRows) + 1, ValuesMap: input.Data, CreatedByUser: "system"}
		if rn := c.Query("row_number"); rn != "" {
			if parsed, err := strconv.Atoi(rn); err == nil && parsed > 0 {
				row.RowNumber = parsed
			}
		}

		if err := repo.CreateTemplateRow(c.Request.Context(), row); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, row)
	}
}

func UpdateTemplateRow(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("rowId")
		var input struct {
			Data map[string]string `json:"data"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		row, err := repo.GetTemplateRowByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "row not found"})
			return
		}

		_, columns, err := repo.GetTemplateByCode(c.Request.Context(), row.TemplateCode)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}
		if err := validateTemplateData(columns, input.Data); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		row.ValuesMap = input.Data
		if err := repo.UpdateTemplateRow(c.Request.Context(), row); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, row)
	}
}

func DeleteTemplateRow(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("rowId")
		if err := repo.DeleteTemplateRow(c.Request.Context(), id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "row deleted"})
	}
}

func ExportTemplateRowsXLSX(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		code := c.Param("code")
		_, columns, err := repo.GetTemplateByCode(c.Request.Context(), code)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}
		rows, err := repo.ListTemplateRows(c.Request.Context(), projectID, code)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		filename := fmt.Sprintf("%s_%s.csv", code, projectID)
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))

		writer := csv.NewWriter(c.Writer)
		header := make([]string, 0, len(columns))
		for _, col := range columns {
			header = append(header, col.Title)
		}
		_ = writer.Write(header)
		for _, row := range rows {
			record := make([]string, 0, len(columns))
			for _, col := range columns {
				record = append(record, row.ValuesMap[col.FieldKey])
			}
			_ = writer.Write(record)
		}
		writer.Flush()
	}
}

func validateTemplateData(columns []models.TemplateColumn, data map[string]string) error {
	if data == nil {
		data = map[string]string{}
	}
	for _, col := range columns {
		value := strings.TrimSpace(data[col.FieldKey])
		if col.Required && value == "" {
			return fmt.Errorf("field %q is required", col.Title)
		}
		if value == "" {
			continue
		}
		switch col.DataType {
		case "number":
			if _, err := strconv.ParseFloat(value, 64); err != nil {
				return fmt.Errorf("field %q must be number", col.Title)
			}
		case "date":
			if _, err := time.Parse("2006-01-02", value); err != nil {
				return fmt.Errorf("field %q must be date YYYY-MM-DD", col.Title)
			}
		}
	}
	return nil
}

func matchesRowSearch(row models.ProjectTemplateRow, search string) bool {
	for _, v := range row.ValuesMap {
		if strings.Contains(strings.ToLower(v), search) {
			return true
		}
	}
	return false
}

func parseInt(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	return v
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
