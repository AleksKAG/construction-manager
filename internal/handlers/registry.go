package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type upsertRegistryPayload struct {
	ID            *string `json:"id"`
	VolumeNumber  *int    `json:"volume_number"`
	Code          string  `json:"code"`
	Mark          string  `json:"mark"`
	Designation   string  `json:"designation"`
	Name          string  `json:"name"`
	Contractor    string  `json:"contractor"`
	Note          string  `json:"note"`
	IssueDateFact *string `json:"issue_date_fact"`
}

func ListRegistry(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		stage := normalizeStage(c.Param("stage"))
		if stage == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "stage must be phase-p or phase-r"})
			return
		}

		var rows []models.DocumentRegistry
		if err := repo.RawDB().WithContext(c.Request.Context()).
			Where("project_id = ? AND stage = ?", projectID, stage).
			Order("designation asc").
			Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, rows)
	}
}

func UpsertRegistry(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		stage := normalizeStage(c.Param("stage"))
		if stage == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "stage must be phase-p or phase-r"})
			return
		}

		var input upsertRegistryPayload
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if strings.TrimSpace(input.Designation) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "designation is required"})
			return
		}
		if strings.TrimSpace(input.Name) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
			return
		}

		var issueDate *time.Time
		if input.IssueDateFact != nil && strings.TrimSpace(*input.IssueDateFact) != "" {
			t, err := time.Parse("2006-01-02", strings.TrimSpace(*input.IssueDateFact))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "issue_date_fact must be YYYY-MM-DD"})
				return
			}
			issueDate = &t
		}

		db := repo.RawDB().WithContext(c.Request.Context())
		var saved models.DocumentRegistry
		err := db.Transaction(func(tx *gorm.DB) error {
			var row models.DocumentRegistry
			if input.ID != nil && *input.ID != "" {
				if err := tx.First(&row, "id = ? AND project_id = ? AND stage = ?", *input.ID, projectID, stage).Error; err != nil {
					return err
				}
			} else {
				err := tx.First(&row, "project_id = ? AND stage = ? AND designation = ?", projectID, stage, input.Designation).Error
				if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
					return err
				}
			}

			row.ProjectID = projectID
			row.Stage = stage
			row.VolumeNumber = input.VolumeNumber
			row.Code = input.Code
			row.Mark = input.Mark
			row.Designation = strings.TrimSpace(input.Designation)
			row.Name = strings.TrimSpace(input.Name)
			row.Contractor = input.Contractor
			row.Note = input.Note
			row.IssueDateFact = issueDate
			if row.IssueDateFact != nil {
				row.RevisionCount = 1
			}

			if row.ID == "" {
				if err := tx.Create(&row).Error; err != nil {
					return err
				}
			} else {
				if err := tx.Save(&row).Error; err != nil {
					return err
				}
			}

			var task models.GanttTask
			if row.LinkedTaskID != nil && *row.LinkedTaskID != "" {
				err := tx.First(&task, "id = ?", *row.LinkedTaskID).Error
				if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
					return err
				}
			}

			if task.ID == "" {
				task = models.GanttTask{
					ObjectID: projectID,
					Name:     row.Designation + " — " + row.Name,
					Status:   "not_started",
					Source:   taskSourceByStage(stage),
				}
				if err := tx.Create(&task).Error; err != nil {
					return err
				}
			}

			now := time.Now().UTC()
			row.LinkedTaskID = &task.ID
			row.LastSyncedAt = &now
			if err := tx.Save(&row).Error; err != nil {
				return err
			}

			task.LinkedRegistryID = &row.ID
			task.Name = row.Designation + " — " + row.Name
			task.Source = taskSourceByStage(stage)
			if strings.TrimSpace(row.Contractor) != "" {
				task.Contractor = row.Contractor
			}
			if err := tx.Save(&task).Error; err != nil {
				return err
			}

			saved = row
			return nil
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, saved)
	}
}

func normalizeStage(stage string) string {
	switch strings.ToLower(strings.TrimSpace(stage)) {
	case "phase-p", "p":
		return "P"
	case "phase-r", "r":
		return "R"
	default:
		return ""
	}
}

func taskSourceByStage(stage string) string {
	if stage == "R" {
		return "REGISTRY_R"
	}
	return "REGISTRY_P"
}

// DeleteRegistry — DELETE /projects/:id/design/:stage/registry/:rowId
func DeleteRegistry(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		stage := normalizeStage(c.Param("stage"))
		rowID := c.Param("rowId")
		if stage == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "stage must be phase-p or phase-r"})
			return
		}
		if err := repo.RawDB().
			Where("id = ? AND project_id = ? AND stage = ?", rowID, projectID, stage).
			Delete(&models.DocumentRegistry{}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "deleted"})
	}
}
