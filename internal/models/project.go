package models

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ProjectObject — строительный объект
type ProjectObject struct {
	ID              string             `gorm:"primaryKey;type:text" json:"id"`
	Name            string             `gorm:"type:text;not null" json:"name"`
	Address         string             `gorm:"type:text" json:"address,omitempty"`
	Budget          float64            `gorm:"type:real" json:"budget,omitempty"`
	Status          string             `gorm:"type:text;default:'planning'" json:"status"`
	DurationDays    int                `gorm:"type:integer;default:0" json:"duration_days,omitempty"`
	Characteristics string             `gorm:"type:text" json:"-"` // Храним как JSON строку
	CostEstimates   string             `gorm:"type:text" json:"-"` // Храним как JSON строку
	CharMap         map[string]string  `gorm:"-" json:"characteristics,omitempty"` // Для JSON сериализации
	CostMap         map[string]float64 `gorm:"-" json:"cost_estimates,omitempty"`  // Для JSON сериализации
	CreatedAt       time.Time          `gorm:"autoCreateTime" json:"created_at,omitempty"`
	UpdatedAt       time.Time          `gorm:"autoUpdateTime" json:"updated_at,omitempty"`
}

// BeforeSave — сериализация JSON полей перед сохранением
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

// AfterFind — десериализация JSON полей после загрузки
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

// BeforeCreate — генерация UUID перед сохранением
func (p *ProjectObject) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return nil
}

// GanttTask — задача для графика (отдельная таблица)
type GanttTask struct {
	ID        string  `gorm:"primaryKey;type:text" json:"id"`
	ObjectID  string  `gorm:"type:text;index" json:"object_id"`
	Name      string  `gorm:"type:text;not null" json:"name"`
	StartDate string  `gorm:"type:text" json:"start_date,omitempty"`
	EndDate   string  `gorm:"type:text" json:"end_date,omitempty"`
	Duration  int     `gorm:"type:integer" json:"duration,omitempty"`
	Progress  float64 `gorm:"type:real;default:0" json:"progress,omitempty"`
	Status    string  `gorm:"type:text;default:'не начато'" json:"status,omitempty"`
}

// BeforeCreate — генерация UUID
func (t *GanttTask) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}

