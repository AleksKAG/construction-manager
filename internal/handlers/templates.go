package handlers

import (
	"net/http"
	"strconv"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

func GetTemplate(repo repository.Repository) gin.HandlerFunc {
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

func ListTemplateRows(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		code := c.Param("code")
		rows, err := repo.ListTemplateRows(c.Request.Context(), projectID, code)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, rows)
	}
}

func CreateTemplateRow(repo repository.Repository) gin.HandlerFunc {
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

		currentRows, err := repo.ListTemplateRows(c.Request.Context(), projectID, code)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		row := &models.ProjectTemplateRow{
			ProjectID:     projectID,
			TemplateCode:  code,
			RowNumber:     len(currentRows) + 1,
			ValuesMap:     input.Data,
			CreatedByUser: "system",
		}

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

func UpdateTemplateRow(repo repository.Repository) gin.HandlerFunc {
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
		row.ValuesMap = input.Data
		if err := repo.UpdateTemplateRow(c.Request.Context(), row); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, row)
	}
}

func DeleteTemplateRow(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("rowId")
		if err := repo.DeleteTemplateRow(c.Request.Context(), id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "row deleted"})
	}
}
