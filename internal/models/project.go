package models

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Project — проект (верхний уровень). Соответствует SQL-таблице projects.
type Project struct {
	ID             string     `gorm:"primaryKey;type:text" json:"id"`
	Code           string     `gorm:"type:text;uniqueIndex;not null" json:"code"`
	Name           string     `gorm:"type:text;not null" json:"name"`
	CustomerName   string     `gorm:"type:text" json:"customer_name,omitempty"`
	Location       string     `gorm:"type:text" json:"location,omitempty"`
	Status         string     `gorm:"type:text;default:'draft';index" json:"status"`
	StartDate      *time.Time `json:"start_date,omitempty"`
	PlannedEndDate *time.Time `json:"planned_end_date,omitempty"`
	ActualEndDate  *time.Time `json:"actual_end_date,omitempty"`
	CreatedBy      *string    `gorm:"type:text;index" json:"created_by,omitempty"`
	CreatedAt      time.Time  `gorm:"autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt      time.Time  `gorm:"autoUpdateTime" json:"updated_at,omitempty"`
}

func (p *Project) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	if p.Status == "" {
		p.Status = "draft"
	}
	return nil
}

// ProjectObject — строительный объект (корпус) внутри проекта.
// Соответствует SQL-таблице project_objects.
type ProjectObject struct {
	ID              string             `gorm:"primaryKey;type:text" json:"id"`
	ProjectID       string             `gorm:"type:text;not null;index" json:"project_id,omitempty"`
	Code            string             `gorm:"type:text" json:"code,omitempty"`
	Name            string             `gorm:"type:text;not null" json:"name"`
	ObjectType      string             `gorm:"type:text;default:'building'" json:"object_type,omitempty"`
	Address         string             `gorm:"type:text" json:"address,omitempty"`
	Budget          float64            `gorm:"type:real" json:"budget,omitempty"`
	Status          string             `gorm:"type:text;default:'planning'" json:"status"`
	DurationDays    int                `gorm:"type:integer;default:0" json:"duration_days,omitempty"`
	Characteristics string             `gorm:"type:text" json:"-"`
	CostEstimates   string             `gorm:"type:text" json:"-"`
	CharMap         map[string]string  `gorm:"-" json:"characteristics,omitempty"`
	CostMap         map[string]float64 `gorm:"-" json:"cost_estimates,omitempty"`
	CreatedAt       time.Time          `gorm:"autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt       time.Time          `gorm:"autoUpdateTime" json:"updated_at,omitempty"`
}

func (p *ProjectObject) BeforeSave(tx *gorm.DB) error {
	if p.CharMap != nil && len(p.CharMap) > 0 {
		data, err := json.Marshal(p.CharMap)
		if err != nil {
			return fmt.Errorf("failed to marshal characteristics: %w", err)
		}
		p.Characteristics = string(data)
	} else {
		p.Characteristics = "{}"
	}

	if p.CostMap != nil && len(p.CostMap) > 0 {
		data, err := json.Marshal(p.CostMap)
		if err != nil {
			return fmt.Errorf("failed to marshal cost estimates: %w", err)
		}
		p.CostEstimates = string(data)
	} else {
		p.CostEstimates = "{}"
	}
	return nil
}

func (p *ProjectObject) AfterFind(tx *gorm.DB) error {
	if p.Characteristics != "" && p.Characteristics != "{}" {
		if err := json.Unmarshal([]byte(p.Characteristics), &p.CharMap); err != nil {
			return fmt.Errorf("failed to unmarshal characteristics: %w", err)
		}
	}
	if p.CostEstimates != "" && p.CostEstimates != "{}" {
		if err := json.Unmarshal([]byte(p.CostEstimates), &p.CostMap); err != nil {
			return fmt.Errorf("failed to unmarshal cost estimates: %w", err)
		}
	}
	return nil
}

func (p *ProjectObject) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	if p.ProjectID == "" {
		p.ProjectID = p.ID
	}
	if p.ObjectType == "" {
		p.ObjectType = "building"
	}
	return nil
}

// GanttTask — задача для графика
type GanttTask struct {
	ID               string  `gorm:"primaryKey;type:text" json:"id"`
	ObjectID         string  `gorm:"type:text;index" json:"object_id"`
	Name             string  `gorm:"type:text;not null" json:"name"`
	StartDate        string  `gorm:"type:text" json:"start_date,omitempty"`
	EndDate          string  `gorm:"type:text" json:"end_date,omitempty"`
	Duration         int     `gorm:"type:integer" json:"duration,omitempty"`
	Progress         float64 `gorm:"type:real;default:0;index:idx_tasks_status_progress,priority:2" json:"progress,omitempty"`
	Status           string  `gorm:"type:text;default:'не начато';index:idx_tasks_status_progress,priority:1" json:"status,omitempty"`
	Contractor       string  `gorm:"type:text" json:"contractor,omitempty"`
	Source           string  `gorm:"type:text;default:'MANUAL'" json:"source,omitempty"`
	LinkedRegistryID *string `gorm:"type:text;index" json:"linked_registry_id,omitempty"`
}

// Errorf implements [assert.TestingT].
func (t GanttTask) Errorf(format string, args ...interface{}) {
	panic("unimplemented")
}

func (t *GanttTask) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}

// User + RBAC
type User struct {
	ID           string    `gorm:"primaryKey;type:text" json:"id"`
	FullName     string    `gorm:"type:text;not null" json:"full_name"`
	Email        string    `gorm:"type:text;uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"type:text" json:"-"`
	IsActive     bool      `gorm:"type:boolean;default:true" json:"is_active"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime" json:"updated_at,omitempty"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	return nil
}

type Role struct {
	ID   string `gorm:"primaryKey;type:text" json:"id"`
	Code string `gorm:"type:text;unique;not null" json:"code"`
	Name string `gorm:"type:text;not null" json:"name"`
}

func (r *Role) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}

type Permission struct {
	ID       string `gorm:"primaryKey;type:text" json:"id"`
	Resource string `gorm:"type:text;index;not null" json:"resource"`
	Action   string `gorm:"type:text;index;not null" json:"action"`
}

func (p *Permission) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return nil
}

type UserRole struct {
	UserID     string    `gorm:"primaryKey;type:text;not null" json:"user_id"`
	RoleID     string    `gorm:"primaryKey;type:text;not null" json:"role_id"`
	ProjectID  string    `gorm:"type:text;index" json:"project_id,omitempty"`
	AssignedAt time.Time `gorm:"autoCreateTime" json:"assigned_at,omitempty"`
}

// Project-level menu and dashboards
type MenuItem struct {
	ID        string `gorm:"primaryKey;type:text" json:"id"`
	ProjectID string `gorm:"type:text;index" json:"project_id,omitempty"`
	ParentID  string `gorm:"type:text;index" json:"parent_id,omitempty"`
	Title     string `gorm:"type:text;not null" json:"title"`
	ViewKey   string `gorm:"type:text;index" json:"view_key,omitempty"`
	ItemType  string `gorm:"type:text;default:'section'" json:"item_type"`
	SortOrder int    `gorm:"type:integer;default:0" json:"sort_order"`
}

func (m *MenuItem) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.New().String()
	}
	return nil
}

type Dashboard struct {
	ID        string `gorm:"primaryKey;type:text" json:"id"`
	ProjectID string `gorm:"type:text;index" json:"project_id,omitempty"`
	Name      string `gorm:"type:text;not null" json:"name"`
	Scope     string `gorm:"type:text;index;default:'project'" json:"scope"`
}

func (d *Dashboard) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	return nil
}

type DashboardWidget struct {
	ID          string `gorm:"primaryKey;type:text" json:"id"`
	DashboardID string `gorm:"type:text;index;not null" json:"dashboard_id"`
	Title       string `gorm:"type:text;not null" json:"title"`
	WidgetType  string `gorm:"type:text;not null" json:"widget_type"`
	ConfigJSON  string `gorm:"type:text" json:"config_json,omitempty"`
	SortOrder   int    `gorm:"type:integer;default:0" json:"sort_order"`
}

func (dw *DashboardWidget) BeforeCreate(tx *gorm.DB) error {
	if dw.ID == "" {
		dw.ID = uuid.New().String()
	}
	return nil
}

// TemplateDefinition describes standard tabular templates (ТЭП, графики, ИДП и т.д.)
type TemplateDefinition struct {
	ID          string `gorm:"primaryKey;type:text" json:"id"`
	Code        string `gorm:"type:text;unique;not null" json:"code"`
	Name        string `gorm:"type:text;not null" json:"name"`
	Description string `gorm:"type:text" json:"description,omitempty"`
}

func (t *TemplateDefinition) TableName() string {
	return "template_definitions"
}

func (t *TemplateDefinition) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}

// TemplateColumn defines required columns for template rows.
type TemplateColumn struct {
	ID           string `gorm:"primaryKey;type:text" json:"id"`
	TemplateCode string `gorm:"type:text;index;not null" json:"template_code"`
	FieldKey     string `gorm:"type:text;not null" json:"field_key"`
	Title        string `gorm:"type:text;not null" json:"title"`
	DataType     string `gorm:"type:text;default:'text'" json:"data_type"`
	Required     bool   `gorm:"type:boolean;default:false" json:"required"`
	SortOrder    int    `gorm:"type:integer;default:0" json:"sort_order"`
}

func (c *TemplateColumn) TableName() string {
	return "template_columns"
}

func (c *TemplateColumn) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return nil
}

// ProjectTemplateRow stores user-entered rows by project and template.
// ProjectTemplateRow — строка заполненного шаблона в контексте проекта.
type ProjectTemplateRow struct {
	ID            string            `gorm:"primaryKey;type:text" json:"id"`
	ProjectID     string            `gorm:"type:text;index;not null" json:"project_id"`
	TemplateCode  string            `gorm:"type:text;index;not null" json:"template_code"`
	RowNumber     int               `gorm:"type:integer;default:1" json:"row_number"`
	ValuesJSON    string            `gorm:"type:text" json:"-"`
	ValuesMap     map[string]string `gorm:"-" json:"data,omitempty"`
	CreatedByUser string            `gorm:"type:text" json:"created_by_user,omitempty"`
	CreatedAt     time.Time         `gorm:"autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt     time.Time         `gorm:"autoUpdateTime" json:"updated_at,omitempty"`
}

func (r *ProjectTemplateRow) TableName() string {
	return "project_template_rows"
}

func (r *ProjectTemplateRow) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}

func (r *ProjectTemplateRow) BeforeSave(tx *gorm.DB) error {
	if r.ValuesMap == nil {
		r.ValuesMap = map[string]string{}
	}
	data, err := json.Marshal(r.ValuesMap)
	if err != nil {
		return fmt.Errorf("failed to marshal row data: %w", err)
	}
	r.ValuesJSON = string(data)
	return nil
}

func (r *ProjectTemplateRow) AfterFind(tx *gorm.DB) error {
	if r.ValuesJSON == "" {
		r.ValuesMap = map[string]string{}
		return nil
	}
	if err := json.Unmarshal([]byte(r.ValuesJSON), &r.ValuesMap); err != nil {
		return fmt.Errorf("failed to unmarshal row data: %w", err)
	}
	return nil
}

// IrdDocument — документ ИРД (ГПЗУ, ТЗ, МТЗ, ТУ)
type IrdDocument struct {
	ID         string    `gorm:"primaryKey;type:text" json:"id"`
	ProjectID  string    `gorm:"type:text;index;not null" json:"project_id"`
	DocType    string    `gorm:"type:text;not null" json:"doc_type"`
	DocNumber  string    `gorm:"type:text" json:"doc_number,omitempty"`
	IssueDate  string    `gorm:"type:text" json:"issue_date,omitempty"`
	ExpiryDate string    `gorm:"type:text" json:"expiry_date,omitempty"`
	Status     string    `gorm:"type:text;default:'active'" json:"status"`
	Issuer     string    `gorm:"type:text" json:"issuer,omitempty"`
	Notes      string    `gorm:"type:text" json:"notes,omitempty"`
	FilePath   string    `gorm:"type:text" json:"file_path,omitempty"`
	CreatedAt  time.Time `gorm:"autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt  time.Time `gorm:"autoUpdateTime" json:"updated_at,omitempty"`
}

func (d *IrdDocument) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	return nil
}
