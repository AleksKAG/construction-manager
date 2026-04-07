package repository

import (
	"context"

	"github.com/AleksKAG/construction-manager/internal/models"
	"gorm.io/gorm"
)

// Repository — главный интерфейс
type Repository interface {
	ProjectRepository
	TaskRepository
	TemplateRepository
	DashboardRepository
	RawDB() *gorm.DB
}

// ======================== Project ========================
type ProjectRepository interface {
	CreateProject(ctx context.Context, p *models.ProjectObject) error
	ListProjects(ctx context.Context) ([]models.ProjectObject, error)
	GetProjectByID(ctx context.Context, id string) (*models.ProjectObject, error)
	UpdateProject(ctx context.Context, p *models.ProjectObject) error
	DeleteProject(ctx context.Context, id string) error
}

// ======================== Task (Gantt) ========================
type TaskRepository interface {
	CreateTask(ctx context.Context, task *models.GanttTask) error
	ListTasksByProject(ctx context.Context, projectID string) ([]models.GanttTask, error)
	GetTaskByID(ctx context.Context, id string) (*models.GanttTask, error)
	UpdateTask(ctx context.Context, task *models.GanttTask) error
	DeleteTask(ctx context.Context, id string) error
}

// ======================== Template ========================
type TemplateRepository interface {
	GetTemplateByCode(ctx context.Context, code string) (*models.TemplateDefinition, []models.TemplateColumn, error)
	ListTemplateRows(ctx context.Context, projectID, templateCode string) ([]models.ProjectTemplateRow, error)
	CreateTemplateRow(ctx context.Context, row *models.ProjectTemplateRow) error
	GetTemplateRowByID(ctx context.Context, id string) (*models.ProjectTemplateRow, error)
	UpdateTemplateRow(ctx context.Context, row *models.ProjectTemplateRow) error
	DeleteTemplateRow(ctx context.Context, id string) error
	ListTemplateDefinitions(ctx context.Context) ([]models.TemplateDefinition, error)
}

// ======================== Dashboard ========================
type DashboardRepository interface {
	// Возвращает % готовности по проектированию и СМР
	GetProjectProgress(ctx context.Context, projectID string) (designProgress, smrProgress float64, err error)
	// Ближайшие / просроченные задачи
	GetUpcomingTasks(ctx context.Context, limit int) ([]models.GanttTask, error)
}
