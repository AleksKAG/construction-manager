package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// DocumentRegistry stores design documentation rows for phase P/R.
type DocumentRegistry struct {
	ID             string     `gorm:"primaryKey;type:text" json:"id"`
	ProjectID      string     `gorm:"type:text;not null;index:idx_registries_project_stage,priority:1;uniqueIndex:ux_registry_project_stage_designation,priority:1" json:"project_id"`
	Stage          string     `gorm:"type:text;not null;index:idx_registries_project_stage,priority:2;uniqueIndex:ux_registry_project_stage_designation,priority:2" json:"stage"`
	VolumeNumber   *int       `gorm:"type:integer" json:"volume_number,omitempty"`
	Code           string     `gorm:"type:text" json:"code,omitempty"`
	Mark           string     `gorm:"type:text" json:"mark,omitempty"`
	Designation    string     `gorm:"type:text;not null;uniqueIndex:ux_registry_project_stage_designation,priority:3" json:"designation"`
	Name           string     `gorm:"type:text;not null" json:"name"`
	Contractor     string     `gorm:"type:text" json:"contractor,omitempty"`
	Note           string     `gorm:"type:text" json:"note,omitempty"`
	IssueDateFact  *time.Time `json:"issue_date_fact,omitempty"`
	RevisionCount  int        `gorm:"type:integer;default:0" json:"revision_count"`
	RevisionsJSON  string     `gorm:"type:text" json:"-"`
	SyncedProgress float64    `gorm:"type:real;default:0" json:"synced_progress"`
	SyncedStatus   string     `gorm:"type:text" json:"synced_status,omitempty"`
	LinkedTaskID   *string    `gorm:"type:text;index" json:"linked_task_id,omitempty"`
	LastSyncedAt   *time.Time `json:"last_synced_at,omitempty"`
	CreatedAt      time.Time  `gorm:"autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt      time.Time  `gorm:"autoUpdateTime" json:"updated_at,omitempty"`
}

func (r *DocumentRegistry) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}

// WorkforceDailyRecord stores daily workforce plan/fact by task.
type WorkforceDailyRecord struct {
	ID         string    `gorm:"primaryKey;type:text" json:"id"`
	TaskID     string    `gorm:"type:text;not null;index:idx_workforce_task_date,priority:1" json:"task_id"`
	WorkDate   time.Time `gorm:"type:date;not null;index:idx_workforce_task_date,priority:2" json:"work_date"`
	Planned    *int      `gorm:"type:integer" json:"planned,omitempty"`
	Actual     *int      `gorm:"type:integer" json:"actual,omitempty"`
	ReportedBy string    `gorm:"type:text" json:"reported_by,omitempty"`
	Comment    string    `gorm:"type:text" json:"comment,omitempty"`
	CreatedAt  time.Time `gorm:"autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt  time.Time `gorm:"autoUpdateTime" json:"updated_at,omitempty"`
}

func (r *WorkforceDailyRecord) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}
