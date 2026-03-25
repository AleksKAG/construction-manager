package repository

import (
	"context"

	"github.com/AleksKAG/construction-manager/internal/models"
	"gorm.io/gorm"
)

type ProjectRepository struct {
	DB *gorm.DB
}

func NewProjectRepository(db *gorm.DB) *ProjectRepository {
	return &ProjectRepository{DB: db}
}

func (r *ProjectRepository) Create(ctx context.Context, project *models.ProjectObject) error {
	return r.DB.WithContext(ctx).Create(project).Error
}

func (r *ProjectRepository) List(ctx context.Context) ([]models.ProjectObject, error) {
	var projects []models.ProjectObject
	err := r.DB.WithContext(ctx).Find(&projects).Error
	return projects, err
}

func (r *ProjectRepository) FindByID(ctx context.Context, id uint) (*models.ProjectObject, error) {
	var project models.ProjectObject
	err := r.DB.WithContext(ctx).First(&project, id).Error
	return &project, err
}

