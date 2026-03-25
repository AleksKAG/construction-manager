package repository

import (
	"context"
	"errors"
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

func (r *ProjectRepository) List(ctx context.Context) ([]*models.ProjectObject, error) {
	var projects []*models.ProjectObject
	err := r.DB.WithContext(ctx).Find(&projects).Error
	return projects, err
}

func (r *ProjectRepository) FindByID(ctx context.Context, id string) (*models.ProjectObject, error) {
	var project models.ProjectObject
	err := r.DB.WithContext(ctx).First(&project, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("not found")
	}
	return &project, err
}

// GetTasksForObject — получение задач для объекта (вместо ProjectGraph)
func (r *ProjectRepository) GetTasksForObject(ctx context.Context, objectID string) ([]*models.GanttTask, error) {
	var tasks []*models.GanttTask
	err := r.DB.WithContext(ctx).Where("object_id = ?", objectID).Find(&tasks).Error
	return tasks, err
}