package handlers

import (
	"net/http"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

// ListProjects — GET /api/v1/projects
func ListProjects(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projects, err := repo.ListProjects(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, projects)
	}
}

// CreateProject — POST /api/v1/projects
func CreateProject(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		var p models.Project
		if err := c.ShouldBindJSON(&p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := repo.CreateProject(c.Request.Context(), &p); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, p)
	}
}

// GetProject — GET /api/v1/projects/:id
func GetProject(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		project, err := repo.GetProjectByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		c.JSON(http.StatusOK, project)
	}
}

// UpdateProject — PUT /api/v1/projects/:id
func UpdateProject(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		existing, err := repo.GetProjectByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		var input models.Project
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		input.ID = existing.ID
		input.CreatedAt = existing.CreatedAt
		if err := repo.UpdateProject(c.Request.Context(), &input); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, input)
	}
}

// DeleteProject — DELETE /api/v1/projects/:id
func DeleteProject(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if err := repo.DeleteProject(c.Request.Context(), id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "deleted"})
	}
}
