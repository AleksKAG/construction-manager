package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"strings"
	"time"
	"unicode"

	"github.com/AleksKAG/construction-manager/internal/integration/s3"
	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// FileService — бизнес-логика FMS
type FileService struct {
	s3Client *s3.Client
	repo     repository.FileRepository
	db       *gorm.DB
}

func NewFileService(s3Client *s3.Client, repo repository.FileRepository, db *gorm.DB) *FileService {
	return &FileService{s3Client: s3Client, repo: repo, db: db}
}

// RequestUpload — создаёт временную запись файла и возвращает presigned PUT URL
func (s *FileService) RequestUpload(ctx context.Context, projectID, name, contentType string, size int64, idempotencyKey string) (map[string]any, error) {
	projectID = strings.TrimSpace(projectID)
	name = sanitizeFileName(name)
	if projectID == "" || name == "" {
		return nil, fmt.Errorf("project_id and safe file name are required")
	}

	// Идемпотентность: если уже есть такой ключ — вернуть существующий
	if idempotencyKey != "" {
		if existing, err := s.repo.GetByIdempotencyKey(idempotencyKey); err == nil && existing != nil {
			// Уже существует, переиспользуем
			ttl := presignedTTL()
			var uploadURL string
			if s.s3Client != nil && existing.TempStorageKey != "" {
				uploadURL, _ = s.s3Client.GetPresignedPUTURL(ctx, existing.TempStorageKey, contentType, ttl)
			}
			return map[string]any{
				"file_id":     existing.ID,
				"upload_url":  uploadURL,
				"storage_key": existing.TempStorageKey,
				"ttl_seconds": int(ttl.Seconds()),
			}, nil
		}
	}

	fileID := uuid.NewString()
	tempKey := fmt.Sprintf("temp/%s/%s/%s", projectID, fileID, name)

	var uploadURL string
	ttl := presignedTTL()
	if s.s3Client != nil {
		var err error
		uploadURL, err = s.s3Client.GetPresignedPUTURL(ctx, tempKey, contentType, ttl)
		if err != nil {
			return nil, fmt.Errorf("presign error: %w", err)
		}
	} else {
		uploadURL = "" // S3 не настроен — заглушка
	}

	file := &models.File{
		ID:             fileID,
		ProjectID:      projectID,
		FolderPath:     "/",
		Name:           name,
		OriginalName:   name,
		TempStorageKey: tempKey,
		SizeBytes:      size,
		ContentType:    contentType,
		Status:         "pending",
		Version:        1,
		IdempotencyKey: idempotencyKey,
	}

	if err := s.repo.Create(file); err != nil {
		return nil, fmt.Errorf("create file record: %w", err)
	}

	return map[string]any{
		"file_id":     fileID,
		"upload_url":  uploadURL,
		"storage_key": tempKey,
		"ttl_seconds": int(ttl.Seconds()),
	}, nil
}

// ConfirmUpload — подтверждает загрузку: переносит ключ из temp в постоянный, обновляет статус
func (s *FileService) ConfirmUpload(ctx context.Context, fileID, action, folderPath string) (*models.File, error) {
	f, err := s.repo.GetByID(fileID)
	if err != nil {
		return nil, fmt.Errorf("file not found: %w", err)
	}

	action = normalizeConfirmAction(action)
	if action == "" {
		return nil, fmt.Errorf("action must be one of: new, update, archive, archive_as_previous")
	}

	folderPath = normalizeFolderPath(firstNonEmpty(folderPath, f.FolderPath))
	newStorageKey := fmt.Sprintf("projects/%s%s/%s", f.ProjectID, folderPath, f.Name)

	// S3 не транзакционный, поэтому сначала выполняем перенос объекта. DB-часть ниже
	// атомарно обновляет files, file_versions, link_references и file_activity.
	if s.s3Client != nil && f.TempStorageKey != "" && f.TempStorageKey != newStorageKey {
		if err := s.s3Client.MoveObject(ctx, f.TempStorageKey, newStorageKey); err != nil {
			return nil, fmt.Errorf("move object: %w", err)
		}
	}

	now := time.Now().UTC()
	newStatus := "approved"
	isArchived := false
	if action == "archive" || action == "archive_as_previous" {
		newStatus = "archived"
		isArchived = true
	}

	linkRef := map[string]any{
		"file_id":     f.ID,
		"version":     f.Version,
		"storage_key": newStorageKey,
		"status":      newStatus,
		"linked_at":   now.Format(time.RFC3339),
		"ai_verified": f.AIMetadata != nil,
	}

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		updates := map[string]any{
			"storage_key":      newStorageKey,
			"temp_storage_key": "",
			"folder_path":      folderPath,
			"status":           newStatus,
			"approved_at":      now,
			"updated_at":       now,
		}
		if err := tx.Model(&models.File{}).Where("id = ?", fileID).Updates(updates).Error; err != nil {
			return fmt.Errorf("update file: %w", err)
		}

		if err := tx.Model(&models.FileVersion{}).Where("file_id = ?", fileID).Updates(map[string]any{"is_current": false}).Error; err != nil {
			return fmt.Errorf("mark previous versions: %w", err)
		}
		fv := &models.FileVersion{
			ID:         uuid.NewString(),
			FileID:     fileID,
			Version:    f.Version,
			StorageKey: newStorageKey,
			SizeBytes:  f.SizeBytes,
			IsCurrent:  !isArchived,
			IsArchived: isArchived,
		}
		if err := tx.Create(fv).Error; err != nil {
			return fmt.Errorf("create file version: %w", err)
		}

		if f.Designation != "" {
			if err := tx.Model(&models.DocumentRegistry{}).
				Where("project_id = ? AND designation = ?", f.ProjectID, f.Designation).
				Updates(map[string]any{"link_references": models.JSONMap(linkRef), "updated_at": now}).Error; err != nil {
				return fmt.Errorf("update link references: %w", err)
			}
		}

		details := map[string]any{"action": action, "folder_path": folderPath, "storage_key": newStorageKey}
		if f.AIMetadata != nil {
			details["ai_metadata"] = f.AIMetadata
		}
		if err := insertFileActivity(tx, f, "confirm_upload", action, details, now); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	f.StorageKey = newStorageKey
	f.TempStorageKey = ""
	f.FolderPath = folderPath
	f.Status = newStatus
	f.ApprovedAt = &now
	return f, nil
}

// GetTree — возвращает дерево папок/файлов
func (s *FileService) GetTree(ctx context.Context, projectID, path string) ([]models.FileTreeNode, error) {
	if path == "" {
		path = "/"
	}
	return s.repo.GetTree(projectID, path)
}

// GetVersions — история версий файла
func (s *FileService) GetVersions(ctx context.Context, fileID string) ([]models.FileVersion, error) {
	return s.repo.GetVersions(fileID)
}

// MoveFile — переместить файл в другую папку
func (s *FileService) MoveFile(ctx context.Context, fileID, newPath string) error {
	if newPath == "" {
		return fmt.Errorf("new_path is required")
	}
	return s.repo.MoveFile(fileID, newPath)
}

// DeleteFile — мягкое или жёсткое удаление
func (s *FileService) DeleteFile(ctx context.Context, fileID string, hard bool) error {
	if hard {
		return s.repo.HardDelete(fileID)
	}
	return s.repo.SoftDelete(fileID)
}

// ListFiles — список файлов проекта (опционально фильтр по пути)
func (s *FileService) ListFiles(ctx context.Context, projectID, path string) ([]models.File, error) {
	if path != "" && path != "/" {
		return s.repo.GetByProjectAndPath(projectID, path)
	}
	return s.repo.GetByProject(projectID)
}

// SetStatus — обновить статус файла
func (s *FileService) SetStatus(ctx context.Context, fileID, status string) error {
	return s.repo.UpdateStatus(fileID, status, nil)
}

// SetAIMeta — обновить AI-метаданные файла
func (s *FileService) SetAIMeta(ctx context.Context, fileID string, meta map[string]any) error {
	return s.repo.UpdateStatus(fileID, "requires_confirmation", meta)
}

// --- helpers ---

func presignedTTL() time.Duration {
	ttl, _ := time.ParseDuration(os.Getenv("S3_PREP_URL_TTL"))
	if ttl <= 0 || ttl > 15*time.Minute {
		return 15 * time.Minute
	}
	return ttl
}

func sanitizeFileName(name string) string {
	name = strings.TrimSpace(path.Base(strings.ReplaceAll(name, "\\", "/")))
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || r == '/' || r == '\\' {
			return -1
		}
		return r
	}, name)
	name = strings.Trim(name, " .")
	if name == "" || name == "." {
		return ""
	}
	return name
}

func normalizeFolderPath(folderPath string) string {
	folderPath = strings.TrimSpace(strings.ReplaceAll(folderPath, "\\", "/"))
	if folderPath == "" || folderPath == "." {
		return "/"
	}
	clean := path.Clean("/" + strings.TrimPrefix(folderPath, "/"))
	if clean == "." {
		return "/"
	}
	return clean
}

func normalizeConfirmAction(action string) string {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "", "new", "update":
		return firstNonEmpty(strings.ToLower(strings.TrimSpace(action)), "new")
	case "archive", "archive_as_previous":
		return strings.ToLower(strings.TrimSpace(action))
	default:
		return ""
	}
}

func insertFileActivity(tx *gorm.DB, f *models.File, action, userDecision string, details map[string]any, now time.Time) error {
	if !tx.Migrator().HasTable("file_activity") {
		return nil
	}
	detailsJSON, _ := json.Marshal(details)
	promptHash, responseHash := hashJSON(details["ai_metadata"]), hashJSON(details)
	return tx.Exec(
		`INSERT INTO file_activity (id, project_id, resource_id, action, details, user_decision, prompt_hash, response_hash, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uuid.NewString(), f.ProjectID, f.ID, action, string(detailsJSON), userDecision, promptHash, responseHash, now,
	).Error
}

func hashJSON(v any) string {
	if v == nil {
		return ""
	}
	data, _ := json.Marshal(v)
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
