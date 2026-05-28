package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

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
	if projectID == "" || name == "" {
		return nil, fmt.Errorf("project_id and name are required")
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
			}, nil
		}
	}

	fileID := uuid.NewString()
	tempKey := fmt.Sprintf("temp/%s/%s/%s", projectID, fileID, name)

	var uploadURL string
	if s.s3Client != nil {
		ttl := presignedTTL()
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
	}, nil
}

// ConfirmUpload — подтверждает загрузку: переносит ключ из temp в постоянный, обновляет статус
func (s *FileService) ConfirmUpload(ctx context.Context, fileID, action, folderPath string) (*models.File, error) {
	f, err := s.repo.GetByID(fileID)
	if err != nil {
		return nil, fmt.Errorf("file not found: %w", err)
	}

	if folderPath == "" {
		folderPath = f.FolderPath
	}
	if folderPath == "" {
		folderPath = "/"
	}

	// Определяем целевой storage_key
	newStorageKey := fmt.Sprintf("projects/%s%s/%s", f.ProjectID, folderPath, f.Name)

	// Перенести объект в S3 (если клиент доступен и есть temp_key)
	if s.s3Client != nil && f.TempStorageKey != "" && f.TempStorageKey != newStorageKey {
		if err := s.s3Client.MoveObject(ctx, f.TempStorageKey, newStorageKey); err != nil {
			// Если MoveObject не поддерживается, просто обновляем ключ
			_ = err
		}
	}

	// Статус на основе action
	newStatus := "approved"
	switch action {
	case "archive":
		newStatus = "archived"
	case "update":
		newStatus = "approved"
	}

	// Обновляем запись
	now := time.Now().UTC()
	updates := map[string]any{
		"storage_key":      newStorageKey,
		"temp_storage_key": "",
		"folder_path":      folderPath,
		"status":           newStatus,
		"approved_at":      now,
		"updated_at":       now,
	}
	if err := s.db.Model(&models.File{}).Where("id = ?", fileID).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update file: %w", err)
	}

	// Создать версию
	fv := &models.FileVersion{
		ID:         uuid.NewString(),
		FileID:     fileID,
		Version:    f.Version,
		StorageKey: newStorageKey,
		SizeBytes:  f.SizeBytes,
		IsCurrent:  true,
	}
	_ = s.repo.CreateVersion(fv)

	// Перечитаем обновлённый файл
	f.StorageKey = newStorageKey
	f.FolderPath = folderPath
	f.Status = newStatus
	f.ApprovedAt = &now

	// Фаза 4: Если у файла есть designation — обновить link_references в registries
	if f.Designation != "" {
		linkRef := map[string]any{
			"file_id":     f.ID,
			"version":     f.Version,
			"storage_key": f.StorageKey,
			"status":      "approved",
			"linked_at":   now,
		}
		data, _ := json.Marshal(linkRef)
		s.db.Exec(
			`UPDATE document_registries SET link_references = ?::jsonb, updated_at = NOW() WHERE project_id = ? AND designation = ?`,
			string(data), f.ProjectID, f.Designation,
		)
	}

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
	if ttl == 0 {
		ttl = time.Hour
	}
	return ttl
}
