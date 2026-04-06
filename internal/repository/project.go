package repository

import (
	"context"
	"errors"

	"github.com/AleksKAG/construction-manager/internal/models"
	"gorm.io/gorm"
)

type SQLiteRepository struct {
	DB *gorm.DB
}

type ProjectRepository = SQLiteRepository

func NewSQLiteRepository(db *gorm.DB) *SQLiteRepository {
	return &SQLiteRepository{DB: db}
}

func NewProjectRepository(db *gorm.DB) *ProjectRepository {
	return NewSQLiteRepository(db)
}

func (r *SQLiteRepository) RawDB() *gorm.DB {
	return r.DB
}

func (r *SQLiteRepository) Create(ctx context.Context, project *models.ProjectObject) error {
	return r.DB.WithContext(ctx).Create(project).Error
}

func (r *SQLiteRepository) List(ctx context.Context) ([]models.ProjectObject, error) {
	var projects []models.ProjectObject
	err := r.DB.WithContext(ctx).Find(&projects).Error
	return projects, err
}

func (r *SQLiteRepository) FindByID(ctx context.Context, id string) (*models.ProjectObject, error) {
	var project models.ProjectObject
	err := r.DB.WithContext(ctx).First(&project, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("not found")
	}
	return &project, err
}

func (r *SQLiteRepository) Update(ctx context.Context, project *models.ProjectObject) error {
	return r.DB.WithContext(ctx).Save(project).Error
}

func (r *SQLiteRepository) Delete(ctx context.Context, id string) error {
	return r.DB.WithContext(ctx).Delete(&models.ProjectObject{}, "id = ?", id).Error
}

// GetTasksForObject — получение задач для объекта
func (r *SQLiteRepository) GetTasksForObject(ctx context.Context, objectID string) ([]models.GanttTask, error) {
	var tasks []models.GanttTask
	err := r.DB.WithContext(ctx).Where("object_id = ?", objectID).Find(&tasks).Error
	return tasks, err
}

// CreateTask — создание задачи
func (r *SQLiteRepository) CreateTask(ctx context.Context, task *models.GanttTask) error {
	return r.DB.WithContext(ctx).Create(task).Error
}

// UpdateTask — обновление задачи
func (r *SQLiteRepository) UpdateTask(ctx context.Context, task *models.GanttTask) error {
	return r.DB.WithContext(ctx).Save(task).Error
}

// DeleteTask — удаление задачи
func (r *SQLiteRepository) DeleteTask(ctx context.Context, id string) error {
	return r.DB.WithContext(ctx).Delete(&models.GanttTask{}, "id = ?", id).Error
}

// GetTaskByID — получение задачи по ID
func (r *SQLiteRepository) GetTaskByID(ctx context.Context, id string) (*models.GanttTask, error) {
	var task models.GanttTask
	err := r.DB.WithContext(ctx).First(&task, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("task not found")
	}
	return &task, err
}

func (r *SQLiteRepository) GetTemplateByCode(ctx context.Context, code string) (*models.TemplateDefinition, []models.TemplateColumn, error) {
	var tpl models.TemplateDefinition
	if err := r.DB.WithContext(ctx).First(&tpl, "code = ?", code).Error; err != nil {
		return nil, nil, err
	}
	var cols []models.TemplateColumn
	if err := r.DB.WithContext(ctx).Where("template_code = ?", code).Order("sort_order asc").Find(&cols).Error; err != nil {
		return nil, nil, err
	}
	return &tpl, cols, nil
}

func (r *SQLiteRepository) ListTemplateRows(ctx context.Context, projectID, code string) ([]models.ProjectTemplateRow, error) {
	var rows []models.ProjectTemplateRow
	err := r.DB.WithContext(ctx).Where("project_id = ? AND template_code = ?", projectID, code).Order("row_number asc").Find(&rows).Error
	return rows, err
}

func (r *SQLiteRepository) CreateTemplateRow(ctx context.Context, row *models.ProjectTemplateRow) error {
	return r.DB.WithContext(ctx).Create(row).Error
}

func (r *SQLiteRepository) GetTemplateRowByID(ctx context.Context, id string) (*models.ProjectTemplateRow, error) {
	var row models.ProjectTemplateRow
	err := r.DB.WithContext(ctx).First(&row, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("row not found")
	}
	return &row, err
}

func (r *SQLiteRepository) UpdateTemplateRow(ctx context.Context, row *models.ProjectTemplateRow) error {
	return r.DB.WithContext(ctx).Save(row).Error
}

func (r *SQLiteRepository) DeleteTemplateRow(ctx context.Context, id string) error {
	return r.DB.WithContext(ctx).Delete(&models.ProjectTemplateRow{}, "id = ?", id).Error
}

func (r *SQLiteRepository) ListTemplateDefinitions(ctx context.Context) ([]models.TemplateDefinition, error) {
	var templates []models.TemplateDefinition
	err := r.DB.WithContext(ctx).Order("name asc").Find(&templates).Error
	return templates, err
}
