package handlers

import (
	"net/http"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

type workforceCreatePayload struct {
	TaskID     string `json:"task_id"`
	WorkDate   string `json:"work_date"`
	Planned    *int   `json:"planned"`
	Actual     *int   `json:"actual"`
	ReportedBy string `json:"reported_by"`
	Comment    string `json:"comment"`
}

func ListWorkforceByProject(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		var rows []models.WorkforceDailyRecord
		err := repo.RawDB().WithContext(c.Request.Context()).
			Table("workforce_daily_records as w").
			Joins("join gantt_tasks t on t.id = w.task_id").
			Where("t.object_id = ?", projectID).
			Order("w.work_date desc").
			Scan(&rows).Error
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, rows)
	}
}

func CreateWorkforceRecord(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		var input workforceCreatePayload
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if input.TaskID == "" || input.WorkDate == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "task_id and work_date are required"})
			return
		}

		workDate, err := time.Parse("2006-01-02", input.WorkDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "work_date must be YYYY-MM-DD"})
			return
		}

		db := repo.RawDB().WithContext(c.Request.Context())
		var task models.GanttTask
		if err := db.First(&task, "id = ?", input.TaskID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}
		if task.ObjectID != projectID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "task does not belong to project"})
			return
		}

		record := models.WorkforceDailyRecord{
			TaskID:     input.TaskID,
			WorkDate:   workDate,
			Planned:    input.Planned,
			Actual:     input.Actual,
			ReportedBy: input.ReportedBy,
			Comment:    input.Comment,
		}
		if err := db.Create(&record).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, record)
	}
}
