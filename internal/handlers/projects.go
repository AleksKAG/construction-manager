package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

var projectStatuses = []string{"draft", "design", "construction", "commissioning", "completed"}

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
		if err := validateProjectRequired(&p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		applyProjectGeocode(&p)
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
		if existing.Status == "completed" {
			c.JSON(http.StatusConflict, gin.H{"error": "completed project is locked for parameter changes"})
			return
		}
		var input models.Project
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := validateProjectRequired(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		input.ID = existing.ID
		input.Code = firstNonEmpty(input.Code, existing.Code)
		input.CreatedBy = existing.CreatedBy
		input.CreatedAt = existing.CreatedAt
		if input.Status == "" {
			input.Status = existing.Status
		}
		if input.Status != existing.Status && !isAllowedProjectStatusTransition(existing.Status, input.Status) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project status transition"})
			return
		}
		if input.Status == "completed" && input.ActualEndDate == nil {
			now := time.Now().UTC()
			input.ActualEndDate = &now
		}
		applyProjectGeocode(&input)
		if err := repo.UpdateProject(c.Request.Context(), &input); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, input)
	}
}

// UpdateProjectStatus — PUT /api/v1/projects/:id/status
func UpdateProjectStatus(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		project, err := repo.GetProjectByID(c.Request.Context(), c.Param("id"))
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		var input struct {
			Status string `json:"status" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		input.Status = strings.TrimSpace(input.Status)
		if !isAllowedProjectStatusTransition(project.Status, input.Status) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project status transition"})
			return
		}
		project.Status = input.Status
		if project.Status == "completed" && project.ActualEndDate == nil {
			now := time.Now().UTC()
			project.ActualEndDate = &now
		}
		if err := repo.UpdateProject(c.Request.Context(), project); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"project_id": project.ID, "status": project.Status, "actual_end_date": project.ActualEndDate, "final_evm_report_requested": project.Status == "completed"})
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

func validateProjectRequired(p *models.Project) error {
	if strings.TrimSpace(p.Name) == "" {
		return messageResponse("name is required")
	}
	if strings.TrimSpace(p.Address) == "" && strings.TrimSpace(p.Location) == "" {
		return messageResponse("address is required")
	}
	if p.BudgetTotal <= 0 {
		return messageResponse("budget_total must be greater than 0")
	}
	if p.StartDate == nil {
		return messageResponse("start_date is required")
	}
	if p.PlannedEndDate == nil {
		return messageResponse("planned_end_date is required")
	}
	if strings.TrimSpace(p.RegionCode) == "" {
		return messageResponse("region_code is required")
	}
	if p.Status != "" {
		p.Status = normalizeProjectWorkflowStatus(p.Status)
	}
	if p.Status != "" && !isKnownProjectStatus(p.Status) {
		return messageResponse("unsupported project status")
	}
	return nil
}

type messageResponse string

func (m messageResponse) Error() string { return string(m) }

func isKnownProjectStatus(status string) bool {
	status = normalizeProjectWorkflowStatus(status)
	for _, s := range projectStatuses {
		if status == s {
			return true
		}
	}
	return false
}

func isAllowedProjectStatusTransition(from, to string) bool {
	from = normalizeProjectWorkflowStatus(from)
	to = normalizeProjectWorkflowStatus(to)
	if from == to {
		return isKnownProjectStatus(to)
	}
	if from == "" {
		from = "draft"
	}
	for i, s := range projectStatuses {
		if s == from {
			return i+1 < len(projectStatuses) && projectStatuses[i+1] == to
		}
	}
	return false
}

func normalizeProjectWorkflowStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "planning":
		return "draft"
	case "active":
		return "design"
	case "complete":
		return "completed"
	default:
		return strings.ToLower(strings.TrimSpace(status))
	}
}

func applyProjectGeocode(p *models.Project) {
	p.Address = strings.TrimSpace(firstNonEmpty(p.Address, p.Location))
	if p.Location == "" {
		p.Location = p.Address
	}
	if p.Address == "" || (p.Latitude != 0 && p.Longitude != 0) {
		return
	}

	// Offline fallback for the approved pilot object in Perm.
	// Do not fabricate coordinates for unknown addresses; external geocoder
	// integration can overwrite these fields when configured.
	address := strings.ToLower(p.Address)
	if strings.Contains(address, "перм") || strings.Contains(address, "perm") || strings.TrimSpace(p.RegionCode) == "59" {
		p.Latitude = 58.0105
		p.Longitude = 56.2502
	}
}
