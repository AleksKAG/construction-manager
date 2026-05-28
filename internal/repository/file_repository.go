package repository

import (
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"gorm.io/gorm"
)

// FileRepository — интерфейс репозитория файлов FMS
type FileRepository interface {
	Create(f *models.File) error
	GetByID(id string) (*models.File, error)
	GetByProject(projectID string) ([]models.File, error)
	GetByProjectAndPath(projectID, folderPath string) ([]models.File, error)
	GetTree(projectID, path string) ([]models.FileTreeNode, error)
	UpdateStatus(id, status string, aiMeta map[string]any) error
	UpdateStorageKey(id, storageKey, tempKey string) error
	MoveFile(id, newPath string) error
	SoftDelete(id string) error
	HardDelete(id string) error
	CreateVersion(fv *models.FileVersion) error
	GetVersions(fileID string) ([]models.FileVersion, error)
	SaveAIResult(r *models.AIAnalysisResult) error
	GetByIdempotencyKey(key string) (*models.File, error)
}

type fileRepo struct{ db *gorm.DB }

func NewFileRepository(db *gorm.DB) FileRepository {
	return &fileRepo{db: db}
}

func (r *fileRepo) Create(f *models.File) error {
	return r.db.Create(f).Error
}

func (r *fileRepo) GetByID(id string) (*models.File, error) {
	var f models.File
	err := r.db.First(&f, "id = ?", id).Error
	return &f, err
}

func (r *fileRepo) GetByProject(projectID string) ([]models.File, error) {
	var files []models.File
	err := r.db.Where("project_id = ? AND status != ?", projectID, "deleted").
		Order("folder_path, name").
		Find(&files).Error
	return files, err
}

func (r *fileRepo) GetByProjectAndPath(projectID, folderPath string) ([]models.File, error) {
	var files []models.File
	err := r.db.Where("project_id = ? AND folder_path = ? AND status != ?", projectID, folderPath, "deleted").
		Order("name").
		Find(&files).Error
	return files, err
}

func (r *fileRepo) GetTree(projectID, path string) ([]models.FileTreeNode, error) {
	// Получаем все файлы проекта (не удалённые)
	var files []models.File
	err := r.db.Where("project_id = ? AND status != ?", projectID, "deleted").
		Order("folder_path, name").
		Find(&files).Error
	if err != nil {
		return nil, err
	}

	// Строим дерево папок
	folderSet := map[string]bool{}
	for _, f := range files {
		parts := strings.Split(strings.Trim(f.FolderPath, "/"), "/")
		cumPath := ""
		for _, p := range parts {
			if p == "" {
				continue
			}
			if cumPath == "" {
				cumPath = "/" + p
			} else {
				cumPath = cumPath + "/" + p
			}
			folderSet[cumPath] = true
		}
	}

	// Если path == "/" — возвращаем корневые папки и файлы
	var nodes []models.FileTreeNode

	// Добавляем подпапки
	for folder := range folderSet {
		parent := parentPath(folder)
		if parent == path {
			nodes = append(nodes, models.FileTreeNode{
				Type: "folder",
				Name: lastName(folder),
				Path: folder,
			})
		}
	}

	// Добавляем файлы в текущей папке
	for _, f := range files {
		if f.FolderPath == path {
			nodes = append(nodes, models.FileTreeNode{
				Type:    "file",
				Name:    f.Name,
				Path:    f.FolderPath + "/" + f.Name,
				FileID:  f.ID,
				Status:  f.Status,
				DocType: f.DocType,
				Version: f.Version,
			})
		}
	}

	return nodes, nil
}

func (r *fileRepo) UpdateStatus(id, status string, aiMeta map[string]any) error {
	updates := map[string]any{
		"status":     status,
		"updated_at": time.Now().UTC(),
	}
	if aiMeta != nil {
		updates["ai_metadata"] = aiMeta
	}
	return r.db.Model(&models.File{}).Where("id = ?", id).Updates(updates).Error
}

func (r *fileRepo) UpdateStorageKey(id, storageKey, tempKey string) error {
	return r.db.Model(&models.File{}).Where("id = ?", id).Updates(map[string]any{
		"storage_key":      storageKey,
		"temp_storage_key": tempKey,
		"updated_at":       time.Now().UTC(),
	}).Error
}

func (r *fileRepo) MoveFile(id, newPath string) error {
	return r.db.Model(&models.File{}).Where("id = ?", id).Updates(map[string]any{
		"folder_path": newPath,
		"updated_at":  time.Now().UTC(),
	}).Error
}

func (r *fileRepo) SoftDelete(id string) error {
	return r.db.Model(&models.File{}).Where("id = ?", id).Updates(map[string]any{
		"status":     "deleted",
		"updated_at": time.Now().UTC(),
	}).Error
}

func (r *fileRepo) HardDelete(id string) error {
	return r.db.Unscoped().Delete(&models.File{}, "id = ?", id).Error
}

func (r *fileRepo) CreateVersion(fv *models.FileVersion) error {
	return r.db.Create(fv).Error
}

func (r *fileRepo) GetVersions(fileID string) ([]models.FileVersion, error) {
	var versions []models.FileVersion
	err := r.db.Where("file_id = ?", fileID).
		Order("version DESC").
		Find(&versions).Error
	return versions, err
}

func (r *fileRepo) SaveAIResult(res *models.AIAnalysisResult) error {
	return r.db.Create(res).Error
}

func (r *fileRepo) GetByIdempotencyKey(key string) (*models.File, error) {
	var f models.File
	err := r.db.First(&f, "idempotency_key = ?", key).Error
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// --- helpers ---

func parentPath(p string) string {
	idx := strings.LastIndex(p, "/")
	if idx <= 0 {
		return "/"
	}
	return p[:idx]
}

func lastName(p string) string {
	idx := strings.LastIndex(p, "/")
	if idx < 0 {
		return p
	}
	return p[idx+1:]
}
