package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

func ListObjects(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projects, err := repo.List(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		search := strings.ToLower(strings.TrimSpace(c.Query("search")))
		filtered := make([]models.ProjectObject, 0, len(projects))
		for _, p := range projects {
			if search == "" || strings.Contains(strings.ToLower(p.Name), search) || strings.Contains(strings.ToLower(p.Address), search) {
				filtered = append(filtered, p)
			}
		}

		page := objMax(1, objParseInt(c.Query("page"), 1))
		pageSize := objMin(200, objMax(1, objParseInt(c.Query("page_size"), 20)))
		start := (page - 1) * pageSize
		if start > len(filtered) {
			start = len(filtered)
		}
		end := objMin(len(filtered), start+pageSize)

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

func CreateObject(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		var p models.ProjectObject // ← ✅ Правильно: models.ProjectObject
		if err := c.ShouldBindJSON(&p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := repo.Create(c.Request.Context(), &p); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, p)
	}
}

func GetObject(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		project, err := repo.FindByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusOK, project)
	}
}

func UpdateObject(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		var input models.ProjectObject
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		existing, err := repo.FindByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "object not found"})
			return
		}

		// Обновляем поля
		if input.Name != "" {
			existing.Name = input.Name
		}
		if input.Address != "" {
			existing.Address = input.Address
		}
		if input.Budget > 0 {
			existing.Budget = input.Budget
		}
		if input.Status != "" {
			existing.Status = input.Status
		}
		if input.DurationDays > 0 {
			existing.DurationDays = input.DurationDays
		}
		if input.CharMap != nil {
			existing.CharMap = input.CharMap
		}
		if input.CostMap != nil {
			existing.CostMap = input.CostMap
		}

		if err := repo.Update(c.Request.Context(), existing); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, existing)
	}
}

func DeleteObject(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		if err := repo.Delete(c.Request.Context(), id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "object deleted successfully"})
	}
}

// === Gantt Task Handlers ===

func ListTasks(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		objectID := c.Param("id")
		if objectID == "" {
			objectID = c.Param("object_id")
		}
		if objectID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object_id is required"})
			return
		}

		tasks, err := repo.GetTasksForObject(c.Request.Context(), objectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, tasks)
	}
}

func CreateTask(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		var task models.GanttTask
		if err := c.ShouldBindJSON(&task); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if task.ObjectID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object_id is required"})
			return
		}

		if err := repo.CreateTask(c.Request.Context(), &task); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, task)
	}
}

func GetTask(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		task, err := repo.GetTaskByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}
		c.JSON(http.StatusOK, task)
	}
}

func UpdateTask(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		var input models.GanttTask
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		existing, err := repo.GetTaskByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}

		// Обновляем поля
		if input.Name != "" {
			existing.Name = input.Name
		}
		if input.StartDate != "" {
			existing.StartDate = input.StartDate
		}
		if input.EndDate != "" {
			existing.EndDate = input.EndDate
		}
		if input.Duration > 0 {
			existing.Duration = input.Duration
		}
		if input.Progress >= 0 {
			existing.Progress = input.Progress
		}
		if input.Status != "" {
			existing.Status = input.Status
		}

		if err := repo.UpdateTask(c.Request.Context(), existing); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, existing)
	}
}

func DeleteTask(repo *repository.ProjectRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		if err := repo.DeleteTask(c.Request.Context(), id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "task deleted successfully"})
	}
}

// Helper function to parse ID from URL parameter
func parseID(c *gin.Context, paramName string) (string, error) {
	id := c.Param(paramName)
	if id == "" {
		return "", strconv.ErrSyntax
	}
	return id, nil
}

func objMin(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func objMax(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func objParseInt(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	return v
}
