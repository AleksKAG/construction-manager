package models

import "time"

type DocumentStatus string

const (
	StatusDraft DocumentStatus = "draft"
)

type Document struct {
	ID          string         `gorm:"primaryKey;type:text" json:"id"`
	ProjectID   string         `gorm:"type:text;not null;index:idx_doc_project" json:"project_id"`
	DocType     string         `gorm:"type:varchar(20);not null" json:"doc_type"`
	Designation string         `gorm:"type:varchar(100);not null;index:idx_doc_designation" json:"designation"`
	Version     int            `gorm:"default:1" json:"version"`
	StorageKey  string         `gorm:"type:text;not null;uniqueIndex:idx_doc_storagekey" json:"storage_key"`
	FileHash    []byte         `gorm:"type:bytea;not null" json:"-"`
	Status      DocumentStatus `gorm:"type:varchar(30);default:'draft'" json:"status"`
	Name        string         `gorm:"type:text" json:"name"`
	SizeBytes   int64          `gorm:"not null" json:"size_bytes"`
	ContentType string         `gorm:"type:varchar(100)" json:"content_type"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}
