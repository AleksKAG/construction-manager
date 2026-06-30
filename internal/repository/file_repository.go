package repository

import (
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// FileRepository — интерфейс репозитория файлов FMS
type FileRepository interface {
	Create(f *models.File) error
	GetByID(id string) (*models.File, error)
	GetByProject(projectID string) ([]models.File, error)
	GetByProjectAndPath(projectID, folderPath string) ([]models.File, error)
	GetTree(projectID, path string) ([]models.FileTreeNode, error)
	CreateFolder(projectID, parentPath, name, createdBy string) (*models.FileFolder, error)
	MoveFolder(projectID, folderPath, newParentPath string) error
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

	folderSet := map[string]bool{}
	var folders []models.FileFolder
	if r.db.Migrator().HasTable(&models.FileFolder{}) {
		if err := r.db.Where("project_id = ?", projectID).Order("path").Find(&folders).Error; err != nil {
			return nil, err
		}
		for _, folder := range folders {
			folderSet[folder.Path] = true
		}
	}

	// Добавляем виртуальные папки из путей файлов для обратной совместимости.
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

	var nodes []models.FileTreeNode
	for folder := range folderSet {
		if parentPath(folder) == path {
			nodes = append(nodes, models.FileTreeNode{Type: "folder", Name: lastName(folder), Path: folder})
		}
	}

	for _, f := range files {
		if f.FolderPath == path {
			nodes = append(nodes, models.FileTreeNode{
				Type:    "file",
				Name:    f.Name,
				Path:    strings.TrimRight(f.FolderPath, "/") + "/" + f.Name,
				FileID:  f.ID,
				Status:  f.Status,
				DocType: f.DocType,
				Version: f.Version,
			})
		}
	}

	return nodes, nil
}

func (r *fileRepo) CreateFolder(projectID, parentPath, name, createdBy string) (*models.FileFolder, error) {
	folderPath := strings.TrimRight(parentPath, "/") + "/" + strings.Trim(name, " /")
	if parentPath == "/" {
		folderPath = "/" + strings.Trim(name, " /")
	}
	folder := &models.FileFolder{
		ID:         uuid.NewString(),
		ProjectID:  projectID,
		ParentPath: parentPath,
		Path:       folderPath,
		Name:       strings.Trim(name, " /"),
		CreatedBy:  createdBy,
	}
	err := r.db.Where("project_id = ? AND path = ?", projectID, folder.Path).FirstOrCreate(folder).Error
	return folder, err
}

func (r *fileRepo) MoveFolder(projectID, folderPath, newParentPath string) error {
	newPath := strings.TrimRight(newParentPath, "/") + "/" + lastName(folderPath)
	if newParentPath == "/" {
		newPath = "/" + lastName(folderPath)
	}
	oldPrefix := strings.TrimRight(folderPath, "/") + "/"
	newPrefix := strings.TrimRight(newPath, "/") + "/"
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.FileFolder{}).Where("project_id = ? AND path = ?", projectID, folderPath).Updates(map[string]any{"parent_path": newParentPath, "path": newPath, "updated_at": time.Now().UTC()}).Error; err != nil {
			return err
		}
		if err := tx.Exec(`
			UPDATE file_folders
			SET
				parent_path = CASE
					WHEN parent_path = ? THEN ?
					WHEN parent_path LIKE ? THEN ? || substring(parent_path from ?)
					ELSE parent_path
				END,
				path = ? || substring(path from ?),
				updated_at = ?
			WHERE project_id = ? AND path LIKE ?`,
			folderPath, newPath, oldPrefix+"%", newPrefix, len(oldPrefix)+1,
			newPrefix, len(oldPrefix)+1, time.Now().UTC(), projectID, oldPrefix+"%",
		).Error; err != nil {
			return err
		}
		return tx.Exec(`
			UPDATE files
			SET
				folder_path = CASE
					WHEN folder_path = ? THEN ?
					ELSE ? || substring(folder_path from ?)
				END,
				updated_at = ?
			WHERE project_id = ? AND (folder_path = ? OR folder_path LIKE ?)`,
			folderPath, newPath, newPrefix, len(oldPrefix)+1, time.Now().UTC(), projectID, folderPath, oldPrefix+"%",
		).Error
	})
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
