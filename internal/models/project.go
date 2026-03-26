package models

import (
	"time"
	"github.com/google/uuid"
)

// ProjectObject — строительный объект
type ProjectObject struct {
	ID           string             `gorm:"primaryKey;type:text" json:"id"`
	Name         string             `gorm:"type:text;not null" json:"name"`
	Address      string             `gorm:"type:text" json:"address,omitempty"`
	Budget       float64            `gorm:"type:real" json:"budget,omitempty"`
	Status       string             `gorm:"type:text;default:'planning'" json:"status,omitempty"`
	DurationDays int                `gorm:"type:integer;default:0" json:"duration_days,omitempty"`
	Characteristics map[string]string `gorm:"type:json" json:"characteristics,omitempty"`
	CreatedAt    time.Time          `gorm:"autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt    time.Time          `gorm:"autoUpdateTime" json:"updated_at,omitempty"`
}

// BeforeCreate — генерация UUID перед сохранением
func (p *ProjectObject) BeforeCreate() error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return nil
}

// GanttTask — задача для графика (отдельная таблица)
type GanttTask struct {
	ID        string `gorm:"primaryKey;type:text" json:"id"`
	ObjectID  string `gorm:"type:text;index" json:"object_id"` // ← foreign key как поле
	Name      string `gorm:"type:text;not null" json:"name"`
	StartDate string `gorm:"type:text" json:"start_date,omitempty"`
	EndDate   string `gorm:"type:text" json:"end_date,omitempty"`
	Duration  int    `gorm:"type:integer" json:"duration,omitempty"`
	Progress  float64 `gorm:"type:real;default:0" json:"progress,omitempty"`
}

func (t *GanttTask) BeforeCreate() error {
		if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}

