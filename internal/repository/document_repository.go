package repository

import (
	"encoding/json"

	"github.com/AleksKAG/construction-manager/internal/models"
	"gorm.io/gorm"
)

type DocumentRepository interface {
	Create(*models.Document) error
	GetByID(string) (*models.Document, error)
	GetByProject(string) ([]models.Document, error)
	GetByDesignation(string, string) ([]models.Document, error)
	CreateVersion(documentID string, version int, storageKey string, fileHash []byte) error
	LogChange(documentID, changeType string, payload map[string]any) error
}
type documentRepo struct{ db *gorm.DB }

func NewDocumentRepository(db *gorm.DB) DocumentRepository { return &documentRepo{db: db} }
func (r *documentRepo) Create(doc *models.Document) error  { return r.db.Create(doc).Error }
func (r *documentRepo) GetByID(id string) (*models.Document, error) {
	var d models.Document
	err := r.db.First(&d, "id = ?", id).Error
	return &d, err
}
func (r *documentRepo) GetByProject(p string) ([]models.Document, error) {
	var d []models.Document
	err := r.db.Where("project_id = ?", p).Order("updated_at DESC").Find(&d).Error
	return d, err
}
func (r *documentRepo) GetByDesignation(p, des string) ([]models.Document, error) {
	var d []models.Document
	err := r.db.Where("project_id = ? AND designation = ?", p, des).Order("version DESC").Find(&d).Error
	return d, err
}

func (r *documentRepo) CreateVersion(documentID string, version int, storageKey string, fileHash []byte) error {
	return r.db.Exec(
		`INSERT INTO document_versions (document_id, version, storage_key, file_hash) VALUES (?, ?, ?, ?)`,
		documentID, version, storageKey, fileHash,
	).Error
}

func (r *documentRepo) LogChange(documentID, changeType string, payload map[string]any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return r.db.Exec(
		`INSERT INTO document_changes (document_id, change_type, payload) VALUES (?, ?, ?::jsonb)`,
		documentID, changeType, string(data),
	).Error
}
