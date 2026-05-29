package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// JSONMap — тип для хранения произвольного JSONB
type JSONMap map[string]any

func (j JSONMap) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	b, err := json.Marshal(j)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (j *JSONMap) Scan(src any) error {
	if src == nil {
		*j = nil
		return nil
	}
	var data []byte
	switch v := src.(type) {
	case string:
		data = []byte(v)
	case []byte:
		data = v
	default:
		return fmt.Errorf("JSONMap: unsupported type %T", src)
	}
	return json.Unmarshal(data, j)
}

// File — центральная запись файла в FMS
type File struct {
	ID             string     `gorm:"primaryKey;type:text" json:"id"`
	ProjectID      string     `gorm:"type:text;not null;index:idx_files_project" json:"project_id"`
	FolderPath     string     `gorm:"type:text;not null;default:'/'" json:"folder_path"`
	Name           string     `gorm:"type:text;not null" json:"name"`
	OriginalName   string     `gorm:"type:text;not null" json:"original_name"`
	StorageKey     string     `gorm:"type:text;uniqueIndex" json:"storage_key,omitempty"`
	TempStorageKey string     `gorm:"type:text" json:"temp_storage_key,omitempty"`
	SizeBytes      int64      `gorm:"not null;default:0" json:"size_bytes"`
	ContentType    string     `gorm:"type:varchar(100)" json:"content_type,omitempty"`
	Status         string     `gorm:"type:varchar(30);not null;default:'pending'" json:"status"`
	Version        int        `gorm:"not null;default:1" json:"version"`
	DocType        string     `gorm:"type:varchar(50)" json:"doc_type,omitempty"`
	Designation    string     `gorm:"type:varchar(255)" json:"designation,omitempty"`
	UploadedBy     string     `gorm:"type:text" json:"uploaded_by,omitempty"`
	ApprovedBy     string     `gorm:"type:text" json:"approved_by,omitempty"`
	ApprovedAt     *time.Time `json:"approved_at,omitempty"`
	AIMetadata     JSONMap    `gorm:"type:jsonb;serializer:json" json:"ai_metadata,omitempty"`
	IdempotencyKey string     `gorm:"type:text;uniqueIndex" json:"idempotency_key,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

func (File) TableName() string { return "files" }

// FileVersion — история версий файла
type FileVersion struct {
	ID         string    `gorm:"primaryKey;type:text" json:"id"`
	FileID     string    `gorm:"type:text;not null" json:"file_id"`
	Version    int       `gorm:"not null" json:"version"`
	StorageKey string    `gorm:"type:text;not null" json:"storage_key"`
	SizeBytes  int64     `gorm:"not null;default:0" json:"size_bytes"`
	FileHash   string    `gorm:"type:text" json:"file_hash,omitempty"`
	UploadedBy string    `gorm:"type:text" json:"uploaded_by,omitempty"`
	Comment    string    `gorm:"type:text" json:"comment,omitempty"`
	IsCurrent  bool      `gorm:"not null;default:false" json:"is_current"`
	IsArchived bool      `gorm:"not null;default:false" json:"is_archived"`
	CreatedAt  time.Time `json:"created_at"`
}

func (FileVersion) TableName() string { return "file_versions" }

// FileLock — блокировка файла при редактировании
type FileLock struct {
	FileID    string    `gorm:"primaryKey;type:text" json:"file_id"`
	LockedBy  string    `gorm:"type:text;not null" json:"locked_by"`
	LockedAt  time.Time `gorm:"not null;default:now()" json:"locked_at"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
}

func (FileLock) TableName() string { return "file_locks" }

// AIAnalysisResult — результат AI-анализа файла
type AIAnalysisResult struct {
	ID                  string    `gorm:"primaryKey;type:text" json:"id"`
	FileID              string    `gorm:"type:text;not null" json:"file_id"`
	Confidence          float32   `json:"confidence"`
	SuggestedFolder     string    `gorm:"type:text" json:"suggested_folder,omitempty"`
	VersionAction       string    `gorm:"type:varchar(20)" json:"version_action,omitempty"` // new | update | archive
	ExplanationForUser  string    `gorm:"type:text" json:"explanation_for_user,omitempty"`
	RequiresHumanReview bool      `gorm:"not null;default:true" json:"requires_human_review"`
	RawResponse         JSONMap   `gorm:"type:jsonb;serializer:json" json:"raw_response,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
}

func (AIAnalysisResult) TableName() string { return "ai_analysis_results" }

// FileTreeNode — узел дерева файлов
type FileTreeNode struct {
	Type     string         `json:"type"` // "folder" | "file"
	Name     string         `json:"name"`
	Path     string         `json:"path"`
	FileID   string         `json:"file_id,omitempty"`
	Children []FileTreeNode `json:"children,omitempty"`

	// Поля файла (заполняются при type == "file")
	Status  string `json:"status,omitempty"`
	DocType string `json:"doc_type,omitempty"`
	Version int    `json:"version,omitempty"`
}
