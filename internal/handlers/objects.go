package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/AleksKAG/construction-manager/internal/services"
	"github.com/gin-gonic/gin"
)

func ListObjects(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projects, err := repo.ListProjects(c.Request.Context())
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

		_ = page
		_ = pageSize
		c.JSON(http.StatusOK, filtered[start:end])
	}
}

func CreateObject(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		var p models.ProjectObject
		if err := c.ShouldBindJSON(&p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := repo.CreateProject(c.Request.Context(), &p); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := services.EnsureDefaultProjectMenu(repo.RawDB().WithContext(c.Request.Context()), p.ID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, p)
	}
}

func GetObject(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		project, err := repo.GetProjectByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusOK, project)
	}
}

func UpdateObject(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		var input projectObjectUpdatePayload
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		existing, err := repo.GetProjectByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "object not found"})
			return
		}

		applyProjectObjectPatch(existing, input)

		if err := repo.UpdateProject(c.Request.Context(), existing); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, existing)
	}
}

func DeleteObject(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		if err := repo.DeleteProject(c.Request.Context(), id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "object deleted successfully"})
	}
}

// === Gantt Task Handlers ===

func ListTasks(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		tasks, err := repo.ListTasksByProject(c.Request.Context(), "")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, tasks)
	}
}

func ListTasksByObject(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		objectID := c.Query("object_id")
		if objectID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object_id query parameter is required"})
			return
		}

		tasks, err := repo.ListTasksByProject(c.Request.Context(), objectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, tasks)
	}
}

func CreateTask(repo repository.Repository) gin.HandlerFunc {
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

func GetTask(repo repository.Repository) gin.HandlerFunc {
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

func UpdateTask(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		var input ganttTaskUpdatePayload
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		existing, err := repo.GetTaskByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}

		if input.Progress != nil && (*input.Progress < 0 || *input.Progress > 100) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "progress must be in range [0, 100]"})
			return
		}
		applyGanttTaskPatch(existing, input)

		if err := repo.UpdateTask(c.Request.Context(), existing); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if existing.LinkedRegistryID != nil && *existing.LinkedRegistryID != "" {
			now := time.Now().UTC()
			_ = repo.RawDB().WithContext(c.Request.Context()).
				Model(&models.DocumentRegistry{}).
				Where("id = ?", *existing.LinkedRegistryID).
				Updates(map[string]any{
					"synced_progress": existing.Progress,
					"synced_status":   existing.Status,
					"last_synced_at":  now,
				}).Error
		}

		c.JSON(http.StatusOK, existing)
	}
}

func DeleteTask(repo repository.Repository) gin.HandlerFunc {
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

type projectObjectUpdatePayload struct {
	Name         *string             `json:"name"`
	Address      *string             `json:"address"`
	Budget       *float64            `json:"budget"`
	Status       *string             `json:"status"`
	DurationDays *int                `json:"duration_days"`
	CharMap      *map[string]string  `json:"characteristics"`
	CostMap      *map[string]float64 `json:"cost_estimates"`
}

func applyProjectObjectPatch(existing *models.ProjectObject, payload projectObjectUpdatePayload) {
	if payload.Name != nil {
		existing.Name = *payload.Name
	}
	if payload.Address != nil {
		existing.Address = *payload.Address
	}
	if payload.Budget != nil {
		existing.Budget = *payload.Budget
	}
	if payload.Status != nil {
		existing.Status = *payload.Status
	}
	if payload.DurationDays != nil {
		existing.DurationDays = *payload.DurationDays
	}
	if payload.CharMap != nil {
		existing.CharMap = *payload.CharMap
	}
	if payload.CostMap != nil {
		existing.CostMap = *payload.CostMap
	}
}

type ganttTaskUpdatePayload struct {
	Name      *string  `json:"name"`
	StartDate *string  `json:"start_date"`
	EndDate   *string  `json:"end_date"`
	Duration  *int     `json:"duration"`
	Progress  *float64 `json:"progress"`
	Status    *string  `json:"status"`
}

func applyGanttTaskPatch(existing *models.GanttTask, payload ganttTaskUpdatePayload) {
	if payload.Name != nil {
		existing.Name = *payload.Name
	}
	if payload.StartDate != nil {
		existing.StartDate = *payload.StartDate
	}
	if payload.EndDate != nil {
		existing.EndDate = *payload.EndDate
	}
	if payload.Duration != nil {
		existing.Duration = *payload.Duration
	}
	if payload.Progress != nil {
		existing.Progress = *payload.Progress
	}
	if payload.Status != nil {
		existing.Status = *payload.Status
	}
}
