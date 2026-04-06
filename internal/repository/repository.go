package repository

import (
	"context"

	"github.com/AleksKAG/construction-manager/internal/models"
	"gorm.io/gorm"
)

// Repository описывает контракт хранилища данных приложения.
type Repository interface {
	RawDB() *gorm.DB

	Create(ctx context.Context, project *models.ProjectObject) error
	List(ctx context.Context) ([]models.ProjectObject, error)
	FindByID(ctx context.Context, id string) (*models.ProjectObject, error)
	Update(ctx context.Context, project *models.ProjectObject) error
	Delete(ctx context.Context, id string) error

	GetTasksForObject(ctx context.Context, objectID string) ([]models.GanttTask, error)
	CreateTask(ctx context.Context, task *models.GanttTask) error
	UpdateTask(ctx context.Context, task *models.GanttTask) error
	DeleteTask(ctx context.Context, id string) error
	GetTaskByID(ctx context.Context, id string) (*models.GanttTask, error)

	GetTemplateByCode(ctx context.Context, code string) (*models.TemplateDefinition, []models.TemplateColumn, error)
	ListTemplateRows(ctx context.Context, projectID, code string) ([]models.ProjectTemplateRow, error)
	CreateTemplateRow(ctx context.Context, row *models.ProjectTemplateRow) error
	GetTemplateRowByID(ctx context.Context, id string) (*models.ProjectTemplateRow, error)
	UpdateTemplateRow(ctx context.Context, row *models.ProjectTemplateRow) error
	DeleteTemplateRow(ctx context.Context, id string) error
}
