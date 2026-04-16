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

type ProjectRepositoryAlias = SQLiteRepository

func NewSQLiteRepository(db *gorm.DB) *SQLiteRepository {
	return &SQLiteRepository{DB: db}
}

func NewProjectRepository(db *gorm.DB) *ProjectRepositoryAlias {
	return NewSQLiteRepository(db)
}

func (r *SQLiteRepository) RawDB() *gorm.DB {
	return r.DB
}

func (r *SQLiteRepository) CreateProject(ctx context.Context, project *models.ProjectObject) error {
	return r.DB.WithContext(ctx).Create(project).Error
}

func (r *SQLiteRepository) ListProjects(ctx context.Context) ([]models.ProjectObject, error) {
	var projects []models.ProjectObject
	err := r.DB.WithContext(ctx).Find(&projects).Error
	return projects, err
}

func (r *SQLiteRepository) GetProjectByID(ctx context.Context, id string) (*models.ProjectObject, error) {
	var project models.ProjectObject
	err := r.DB.WithContext(ctx).First(&project, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("not found")
	}
	return &project, err
}

func (r *SQLiteRepository) UpdateProject(ctx context.Context, project *models.ProjectObject) error {
	return r.DB.WithContext(ctx).Save(project).Error
}

func (r *SQLiteRepository) DeleteProject(ctx context.Context, id string) error {
	return r.DB.WithContext(ctx).Delete(&models.ProjectObject{}, "id = ?", id).Error
}

func (r *SQLiteRepository) ListTasksByProject(ctx context.Context, objectID string) ([]models.GanttTask, error) {
	var tasks []models.GanttTask
	err := r.DB.WithContext(ctx).Where("object_id = ?", objectID).Find(&tasks).Error
	return tasks, err
}

func (r *SQLiteRepository) CreateTask(ctx context.Context, task *models.GanttTask) error {
	return r.DB.WithContext(ctx).Create(task).Error
}

func (r *SQLiteRepository) UpdateTask(ctx context.Context, task *models.GanttTask) error {
	return r.DB.WithContext(ctx).Save(task).Error
}

func (r *SQLiteRepository) DeleteTask(ctx context.Context, id string) error {
	return r.DB.WithContext(ctx).Delete(&models.GanttTask{}, "id = ?", id).Error
}

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

// ======================== Dashboard Methods ========================

func (r *SQLiteRepository) GetProjectProgress(ctx context.Context, projectID string) (designProgress, smrProgress float64, err error) {
	tasks, err := r.ListTasksByProject(ctx, projectID)
	if err != nil {
		return 0, 0, err
	}

	if len(tasks) == 0 {
		return 0, 0, nil
	}

	var designSum, smrSum float64
	var designCount, smrCount float64

	for _, task := range tasks {
		switch task.Status {
		case "design", "проектирование":
			designSum += task.Progress
			designCount++
		case "smr", "construction", "срм", "смр":
			smrSum += task.Progress
			smrCount++
		default:
			designSum += task.Progress
			designCount++
		}
	}

	if designCount > 0 {
		designProgress = designSum / designCount
	}
	if smrCount > 0 {
		smrProgress = smrSum / smrCount
	}

	return designProgress, smrProgress, nil
}

func (r *SQLiteRepository) GetUpcomingTasks(ctx context.Context, limit int) ([]models.GanttTask, error) {
	var tasks []models.GanttTask
	err := r.DB.WithContext(ctx).
		Where("end_date IS NOT NULL AND end_date <> ''").
		Order("end_date ASC").
		Limit(limit).
		Find(&tasks).Error
	return tasks, err
}

// ======================== IRD (ИРД) Methods ========================

func (r *SQLiteRepository) ListIrdDocuments(ctx context.Context, projectID string) ([]models.IrdDocument, error) {
	var docs []models.IrdDocument
	err := r.DB.WithContext(ctx).Where("project_id = ?", projectID).Order("doc_type asc, doc_number asc").Find(&docs).Error
	return docs, err
}

func (r *SQLiteRepository) CreateIrdDocument(ctx context.Context, doc *models.IrdDocument) error {
	return r.DB.WithContext(ctx).Create(doc).Error
}

func (r *SQLiteRepository) GetIrdDocumentByID(ctx context.Context, id string) (*models.IrdDocument, error) {
	var doc models.IrdDocument
	err := r.DB.WithContext(ctx).First(&doc, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("ird document not found")
	}
	return &doc, err
}

func (r *SQLiteRepository) UpdateIrdDocument(ctx context.Context, doc *models.IrdDocument) error {
	return r.DB.WithContext(ctx).Save(doc).Error
}

func (r *SQLiteRepository) DeleteIrdDocument(ctx context.Context, id string) error {
	return r.DB.WithContext(ctx).Delete(&models.IrdDocument{}, "id = ?", id).Error
}
