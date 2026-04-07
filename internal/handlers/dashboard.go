package handlers

import (
	"net/http"
	"strconv"

	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

func GetDashboardProgress(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		if projectID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "project id is required"})
			return
		}

		design, smr, err := repo.GetProjectProgress(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"design": design, "smr": smr})
	}
}

func GetUpcomingTasks(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 10
		if raw := c.DefaultQuery("limit", "10"); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
				limit = parsed
			}
		}

		tasks, err := repo.GetUpcomingTasks(c.Request.Context(), limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, tasks)
	}
}
