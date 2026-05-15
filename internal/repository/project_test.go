package repository

import (
	"context"
	"errors"
	"testing"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open test DB: %v", err)
	}

	// Миграция всех необходимых таблиц
	err = db.AutoMigrate(
		&models.Project{},
		&models.ProjectObject{},
		&models.GanttTask{},
		&models.TemplateDefinition{},
		&models.TemplateColumn{},
		&models.ProjectTemplateRow{},
		&models.IrdDocument{},
	)
	if err != nil {
		t.Fatalf("failed to migrate tables: %v", err)
	}

	return db
}

func TestGetProjectByID_NotFound(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	project, err := repo.GetProjectByIDLegacy(context.Background(), "non-existent-id")

	assert.Error(t, err)
	assert.Nil(t, project)
	assert.Equal(t, "not found", err.Error())
}

func TestGetProjectByID_Found(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	expected := &models.ProjectObject{
		Name:   "Test Project",
		Status: "active",
	}
	err := db.Create(expected).Error
	assert.NoError(t, err)

	project, err := repo.GetProjectByIDLegacy(context.Background(), expected.ID)

	assert.NoError(t, err)
	assert.NotNil(t, project)
	assert.Equal(t, expected.ID, project.ID)
	assert.Equal(t, expected.Name, project.Name)
}

func TestCreateProject(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	project := &models.ProjectObject{
		Name:   "New Project",
		Status: "planning",
	}

	err := repo.CreateProjectLegacy(context.Background(), project)

	assert.NoError(t, err)
	assert.NotEmpty(t, project.ID)
	assert.NotEmpty(t, project.ProjectID)
}

func TestListProjects_Empty(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	projects, err := repo.ListProjectsLegacy(context.Background())

	assert.NoError(t, err)
	assert.Empty(t, projects)
}

func TestListProjects_WithData(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	expected := []models.ProjectObject{
		{Name: "Project 1", Status: "active"},
		{Name: "Project 2", Status: "planning"},
	}
	for _, p := range expected {
		err := db.Create(&p).Error
		assert.NoError(t, err)
	}

	projects, err := repo.ListProjectsLegacy(context.Background())

	assert.NoError(t, err)
	assert.Len(t, projects, 2)
}

func TestUpdateProject(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	project := &models.ProjectObject{
		Name:   "Original Name",
		Status: "planning",
	}
	err := db.Create(project).Error
	assert.NoError(t, err)

	project.Name = "Updated Name"
	err = repo.UpdateProjectLegacy(context.Background(), project)

	assert.NoError(t, err)

	var updated models.ProjectObject
	err = db.First(&updated, "id = ?", project.ID).Error
	assert.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
}

func TestDeleteProject(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	project := &models.ProjectObject{
		Name:   "To Delete",
		Status: "active",
	}
	err := db.Create(project).Error
	assert.NoError(t, err)

	err = repo.DeleteProjectLegacy(context.Background(), project.ID)

	assert.NoError(t, err)

	var count int64
	err = db.Model(&models.ProjectObject{}).Where("id = ?", project.ID).Count(&count).Error
	assert.NoError(t, err)
	assert.Equal(t, int64(0), count)
}

// ======================== Task Tests ========================

func TestGetTaskByID_NotFound(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	task, err := repo.GetTaskByID(context.Background(), "non-existent-id")

	assert.Error(t, err)
	assert.Nil(t, task)
	assert.Equal(t, "task not found", err.Error())
}

func TestGetTaskByID_Found(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	expected := &models.GanttTask{
		ObjectID: "obj-123",
		Name:     "Test Task",
		Status:   "in_progress",
	}
	err := db.Create(expected).Error
	assert.NoError(t, err)

	task, err := repo.GetTaskByID(context.Background(), expected.ID)

	assert.NoError(t, err)
	assert.NotNil(t, task)
	assert.Equal(t, expected.ID, task.ID)
	assert.Equal(t, expected.Name, task.Name)
}

func TestListTasksByProject(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	objectID := "test-object-123"
	tasks := []models.GanttTask{
		{ObjectID: objectID, Name: "Task 1"},
		{ObjectID: objectID, Name: "Task 2"},
		{ObjectID: "other-object", Name: "Other Task"},
	}
	for _, t := range tasks {
		err := db.Create(&t).Error
		assert.NoError(t, err)
	}

	result, err := repo.ListTasksByProject(context.Background(), objectID)

	assert.NoError(t, err)
	assert.Len(t, result, 2)
}

func TestCreateTask(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	task := &models.GanttTask{
		ObjectID: "obj-123",
		Name:     "New Task",
	}

	err := repo.CreateTask(context.Background(), task)

	assert.NoError(t, err)
	assert.NotEmpty(t, task.ID)
}

func TestUpdateTask(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	task := &models.GanttTask{
		ObjectID: "obj-123",
		Name:     "Original",
		Progress: 0,
	}
	err := db.Create(task).Error
	assert.NoError(t, err)

	task.Name = "Updated"
	task.Progress = 50
	err = repo.UpdateTask(context.Background(), task)

	assert.NoError(t, err)

	var updated models.GanttTask
	err = db.First(&updated, "id = ?", task.ID).Error
	assert.NoError(t, err)
	assert.Equal(t, "Updated", updated.Name)
	assert.Equal(t, float64(50), updated.Progress)
}

func TestDeleteTask(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	task := &models.GanttTask{
		ObjectID: "obj-123",
		Name:     "To Delete",
	}
	err := db.Create(task).Error
	assert.NoError(t, err)

	err = repo.DeleteTask(context.Background(), task.ID)

	assert.NoError(t, err)

	var count int64
	err = db.Model(&models.GanttTask{}).Where("id = ?", task.ID).Count(&count).Error
	assert.NoError(t, err)
	assert.Equal(t, int64(0), count)
}

// ======================== Template Tests ========================

func TestListTemplateRows_Empty(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	rows, err := repo.ListTemplateRows(context.Background(), "project-123", "tep")

	assert.NoError(t, err)
	assert.Empty(t, rows)
}

func TestListTemplateRows_WithData(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	projectID := "proj-123"
	templateCode := "tep"
	rows := []models.ProjectTemplateRow{
		{ProjectID: projectID, TemplateCode: templateCode, RowNumber: 1},
		{ProjectID: projectID, TemplateCode: templateCode, RowNumber: 2},
		{ProjectID: "other-project", TemplateCode: templateCode, RowNumber: 1},
	}
	for _, r := range rows {
		err := db.Create(&r).Error
		assert.NoError(t, err)
	}

	result, err := repo.ListTemplateRows(context.Background(), projectID, templateCode)

	assert.NoError(t, err)
	assert.Len(t, result, 2)
}

func TestCreateTemplateRow(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	row := &models.ProjectTemplateRow{
		ProjectID:    "proj-123",
		TemplateCode: "tep",
		RowNumber:    1,
		ValuesMap:    map[string]string{"key": "value"},
	}

	err := repo.CreateTemplateRow(context.Background(), row)

	assert.NoError(t, err)
	assert.NotEmpty(t, row.ID)
}

func TestGetTemplateRowByID_NotFound(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	row, err := repo.GetTemplateRowByID(context.Background(), "non-existent-id")

	assert.Error(t, err)
	assert.Nil(t, row)
	assert.Equal(t, "row not found", err.Error())
}

func TestGetTemplateRowByID_Found(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	expected := &models.ProjectTemplateRow{
		ProjectID:    "proj-123",
		TemplateCode: "tep",
		RowNumber:    1,
	}
	err := db.Create(expected).Error
	assert.NoError(t, err)

	row, err := repo.GetTemplateRowByID(context.Background(), expected.ID)

	assert.NoError(t, err)
	assert.NotNil(t, row)
	assert.Equal(t, expected.ID, row.ID)
}

func TestUpdateTemplateRow(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	row := &models.ProjectTemplateRow{
		ProjectID:    "proj-123",
		TemplateCode: "tep",
		RowNumber:    1,
		ValuesMap:    map[string]string{"old": "value"},
	}
	err := db.Create(row).Error
	assert.NoError(t, err)

	row.ValuesMap = map[string]string{"new": "value"}
	err = repo.UpdateTemplateRow(context.Background(), row)

	assert.NoError(t, err)

	var updated models.ProjectTemplateRow
	err = db.First(&updated, "id = ?", row.ID).Error
	assert.NoError(t, err)
	assert.Equal(t, "value", updated.ValuesMap["new"])
}

func TestDeleteTemplateRow(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	row := &models.ProjectTemplateRow{
		ProjectID:    "proj-123",
		TemplateCode: "tep",
		RowNumber:    1,
	}
	err := db.Create(row).Error
	assert.NoError(t, err)

	err = repo.DeleteTemplateRow(context.Background(), row.ID)

	assert.NoError(t, err)

	var count int64
	err = db.Model(&models.ProjectTemplateRow{}).Where("id = ?", row.ID).Count(&count).Error
	assert.NoError(t, err)
	assert.Equal(t, int64(0), count)
}

func TestListTemplateDefinitions(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	templates := []models.TemplateDefinition{
		{Code: "tep", Name: "ТЭП"},
		{Code: "smr", Name: "СМР"},
	}
	for _, tpl := range templates {
		err := db.Create(&tpl).Error
		assert.NoError(t, err)
	}

	result, err := repo.ListTemplateDefinitions(context.Background())

	assert.NoError(t, err)
	assert.Len(t, result, 2)
}

// ======================== IRD Tests ========================

func TestListIrdDocuments_Empty(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	docs, err := repo.ListIrdDocuments(context.Background(), "project-123")

	assert.NoError(t, err)
	assert.Empty(t, docs)
}

func TestListIrdDocuments_WithData(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	projectID := "proj-123"
	docs := []models.IrdDocument{
		{ProjectID: projectID, DocType: "ГПЗУ"},
		{ProjectID: projectID, DocType: "ТЗ"},
		{ProjectID: "other-project", DocType: "ТУ"},
	}
	for _, d := range docs {
		err := db.Create(&d).Error
		assert.NoError(t, err)
	}

	result, err := repo.ListIrdDocuments(context.Background(), projectID)

	assert.NoError(t, err)
	assert.Len(t, result, 2)
}

func TestCreateIrdDocument(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	doc := &models.IrdDocument{
		ProjectID: "proj-123",
		DocType:   "ГПЗУ",
	}

	err := repo.CreateIrdDocument(context.Background(), doc)

	assert.NoError(t, err)
	assert.NotEmpty(t, doc.ID)
}

func TestGetIrdDocumentByID_NotFound(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	doc, err := repo.GetIrdDocumentByID(context.Background(), "non-existent-id")

	assert.Error(t, err)
	assert.Nil(t, doc)
	assert.Equal(t, "ird document not found", err.Error())
}

func TestGetIrdDocumentByID_Found(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	expected := &models.IrdDocument{
		ProjectID: "proj-123",
		DocType:   "ГПЗУ",
	}
	err := db.Create(expected).Error
	assert.NoError(t, err)

	doc, err := repo.GetIrdDocumentByID(context.Background(), expected.ID)

	assert.NoError(t, err)
	assert.NotNil(t, doc)
	assert.Equal(t, expected.ID, doc.ID)
}

func TestUpdateIrdDocument(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	doc := &models.IrdDocument{
		ProjectID: "proj-123",
		DocType:   "ГПЗУ",
		Status:    "draft",
	}
	err := db.Create(doc).Error
	assert.NoError(t, err)

	doc.Status = "approved"
	err = repo.UpdateIrdDocument(context.Background(), doc)

	assert.NoError(t, err)

	var updated models.IrdDocument
	err = db.First(&updated, "id = ?", doc.ID).Error
	assert.NoError(t, err)
	assert.Equal(t, "approved", updated.Status)
}

func TestDeleteIrdDocument(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	doc := &models.IrdDocument{
		ProjectID: "proj-123",
		DocType:   "ГПЗУ",
	}
	err := db.Create(doc).Error
	assert.NoError(t, err)

	err = repo.DeleteIrdDocument(context.Background(), doc.ID)

	assert.NoError(t, err)

	var count int64
	err = db.Model(&models.IrdDocument{}).Where("id = ?", doc.ID).Count(&count).Error
	assert.NoError(t, err)
	assert.Equal(t, int64(0), count)
}

// ======================== Dashboard Tests ========================

func TestGetProjectProgress_NoTasks(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	design, smr, err := repo.GetProjectProgress(context.Background(), "project-123")

	assert.NoError(t, err)
	assert.Equal(t, float64(0), design)
	assert.Equal(t, float64(0), smr)
}

func TestGetProjectProgress_WithTasks(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	projectID := "proj-123"
	tasks := []models.GanttTask{
		{ObjectID: projectID, Status: "design", Progress: 80},
		{ObjectID: projectID, Status: "design", Progress: 60},
		{ObjectID: projectID, Status: "smr", Progress: 40},
		{ObjectID: projectID, Status: "smr", Progress: 20},
	}
	for _, task := range tasks {
		err := db.Create(&task).Error
		assert.NoError(t, err)
	}

	design, smr, err := repo.GetProjectProgress(context.Background(), projectID)

	assert.NoError(t, err)
	assert.Equal(t, float64(70), design) // (80+60)/2
	assert.Equal(t, float64(30), smr)    // (40+20)/2
}

func TestGetUpcomingTasks(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	tasks := []models.GanttTask{
		{Name: "Task 1", EndDate: "2026-01-15"},
		{Name: "Task 2", EndDate: "2026-02-20"},
		{Name: "Task 3", EndDate: "2026-03-10"},
	}
	for _, task := range tasks {
		err := db.Create(&task).Error
		assert.NoError(t, err)
	}

	result, err := repo.GetUpcomingTasks(context.Background(), 2)

	assert.NoError(t, err)
	assert.Len(t, result, 2)
	assert.Equal(t, "Task 1", result[0].Name)
	assert.Equal(t, "Task 2", result[1].Name)
}

// ======================== Error Handling Tests ========================

func TestGetProjectByID_RecordNotFound_ErrorIs(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	_, err := repo.GetProjectByIDLegacy(context.Background(), "non-existent")

	assert.True(t, errors.Is(err, errors.New("not found")))
}

func TestGetTaskByID_RecordNotFound_ErrorIs(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	_, err := repo.GetTaskByID(context.Background(), "non-existent")

	assert.True(t, errors.Is(err, errors.New("task not found")))
}

func TestGetTemplateRowByID_RecordNotFound_ErrorIs(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	_, err := repo.GetTemplateRowByID(context.Background(), "non-existent")

	assert.True(t, errors.Is(err, errors.New("row not found")))
}

func TestGetIrdDocumentByID_RecordNotFound_ErrorIs(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormRepository(db)

	_, err := repo.GetIrdDocumentByID(context.Background(), "non-existent")

	assert.True(t, errors.Is(err, errors.New("ird document not found")))
}
