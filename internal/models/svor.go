package models

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	SvorStatusDraft          = "draft"
	SvorStatusSent           = "sent"
	SvorStatusSMHRemarks     = "smh_remarks"
	SvorStatusRework         = "rework"
	SvorStatusApproved       = "approved"
	SvorStatusRejected       = "rejected"
	SvorActionStatusChanged  = "status_changed"
	SvorActionSnapshotSynced = "snapshot_synced"
	SvorActionCreated        = "created"
)

var AllowedSvorTransitions = map[string]map[string]bool{
	SvorStatusDraft: {
		SvorStatusSent: true,
	},
	SvorStatusSent: {
		SvorStatusSMHRemarks: true,
		SvorStatusApproved:   true,
		SvorStatusRejected:   true,
	},
	SvorStatusSMHRemarks: {
		SvorStatusRework: true,
	},
	SvorStatusRework: {
		SvorStatusSent: true,
	},
	SvorStatusApproved: {},
	SvorStatusRejected: {},
}

func IsValidSvorTransition(oldStatus, newStatus string) bool {
	if oldStatus == "" || oldStatus == newStatus {
		return true
	}
	next, ok := AllowedSvorTransitions[oldStatus]
	if !ok {
		return false
	}
	return next[newStatus]
}

// DocStageP — ведомость комплектов стадии П.
type DocStageP struct {
	ID        string    `gorm:"primaryKey;type:text" json:"id"`
	ProjectID string    `gorm:"type:text;index;not null" json:"project_id"`
	Cipher    string    `gorm:"type:text;index;not null" json:"cipher"`
	Name      string    `gorm:"type:text;not null" json:"name"`
	Section   string    `gorm:"type:text;index" json:"section,omitempty"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at,omitempty"`
}

func (d *DocStageP) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	return nil
}

// DocStageR — текущее состояние комплекта РД.
type DocStageR struct {
	ID                  string     `gorm:"primaryKey;type:text" json:"id"`
	ProjectID           string     `gorm:"type:text;index;not null" json:"project_id"`
	CipherPRef          string     `gorm:"type:text;index;not null" json:"cipher_p_ref"`
	CipherR             string     `gorm:"type:text;index;not null" json:"cipher_r"`
	Name                string     `gorm:"type:text;not null" json:"name"`
	IssueDate           *time.Time `gorm:"type:datetime" json:"issue_date,omitempty"`
	CurrentVersion      string     `gorm:"type:text;default:'0'" json:"current_version"`
	CurrentRevisionDate *time.Time `gorm:"type:datetime" json:"current_revision_date,omitempty"`
	CreatedAt           time.Time  `gorm:"autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt           time.Time  `gorm:"autoUpdateTime" json:"updated_at,omitempty"`
}

func (d *DocStageR) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	if d.CurrentVersion == "" {
		d.CurrentVersion = "0"
	}
	return nil
}

// DocStageRRevision — история изменений РД.
type DocStageRRevision struct {
	ID           string    `gorm:"primaryKey;type:text" json:"id"`
	DocRID       string    `gorm:"type:text;index;not null" json:"doc_r_id"`
	RevisionNum  string    `gorm:"type:text;not null" json:"revision_num"`
	RevisionDate time.Time `gorm:"type:datetime;not null" json:"revision_date"`
	ChangeNote   string    `gorm:"type:text" json:"change_note,omitempty"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at,omitempty"`
}

func (d *DocStageRRevision) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	return nil
}

// SvorRecord — основная запись СВОР.
type SvorRecord struct {
	ID                     string     `gorm:"primaryKey;type:text" json:"id"`
	ProjectID              string     `gorm:"type:text;index;not null" json:"project_id"`
	DocRID                 string     `gorm:"type:text;index;not null" json:"doc_r_id"`
	SubmissionDate         *time.Time `gorm:"type:datetime" json:"submission_date,omitempty"`
	ContractorFeedbackDate *time.Time `gorm:"type:datetime" json:"contractor_feedback_date,omitempty"`
	FeedbackDetails        string     `gorm:"type:text" json:"feedback_details,omitempty"`
	Status                 string     `gorm:"type:text;index;default:'draft'" json:"status"`
	RDVersionSnapshot      string     `gorm:"type:text" json:"rd_version_snapshot,omitempty"`
	RDRevisionDateSnapshot *time.Time `gorm:"type:datetime" json:"rd_revision_date_snapshot,omitempty"`
	SvorVersion            string     `gorm:"type:text;default:'1'" json:"svor_version"`
	RDAdjustmentVersion    string     `gorm:"type:text" json:"rd_adjustment_version,omitempty"`
	Notes                  string     `gorm:"type:text" json:"notes,omitempty"`
	LockVersion            int        `gorm:"type:integer;default:1" json:"lock_version"`
	CreatedAt              time.Time  `gorm:"autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt              time.Time  `gorm:"autoUpdateTime" json:"updated_at,omitempty"`

	DocR DocStageR `gorm:"foreignKey:DocRID" json:"doc_r,omitempty"`
}

func (s *SvorRecord) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	if s.Status == "" {
		s.Status = SvorStatusDraft
	}
	if s.SvorVersion == "" {
		s.SvorVersion = "1"
	}
	if s.LockVersion == 0 {
		s.LockVersion = 1
	}
	return nil
}

func (s *SvorRecord) ValidateStatusChange(newStatus string) error {
	if newStatus == "" || newStatus == s.Status {
		return nil
	}
	if !IsValidSvorTransition(s.Status, newStatus) {
		return fmt.Errorf("invalid status transition: %s -> %s", s.Status, newStatus)
	}
	if newStatus == SvorStatusSMHRemarks && s.FeedbackDetails == "" {
		return errors.New("feedback_details is required for smh_remarks status")
	}
	return nil
}

// SvorHistory — полный журнал изменений СВОР.
type SvorHistory struct {
	ID           string    `gorm:"primaryKey;type:text" json:"id"`
	SvorRecordID string    `gorm:"type:text;index;not null" json:"svor_record_id"`
	ActionDate   time.Time `gorm:"type:datetime;not null" json:"action_date"`
	ActionType   string    `gorm:"type:text;index;not null" json:"action_type"`
	OldStatus    string    `gorm:"type:text" json:"old_status,omitempty"`
	NewStatus    string    `gorm:"type:text" json:"new_status,omitempty"`
	Comment      string    `gorm:"type:text" json:"comment,omitempty"`
	UserID       string    `gorm:"type:text;index" json:"user_id,omitempty"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at,omitempty"`
}

func (s *SvorHistory) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	if s.ActionDate.IsZero() {
		s.ActionDate = time.Now().UTC()
	}
	return nil
}
