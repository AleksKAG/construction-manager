package models

import (
	"time"
	"github.com/google/uuid"
)

// ProjectObject — простая модель для SQLite
type ProjectObject struct {
	ID              string             `gorm:"primaryKey;type:text" json:"id"`
	Name            string             `gorm:"type:text;not null" json:"name"`
	Address         string             `gorm:"type:text" json:"address,omitempty"`
	Budget          float64            `gorm:"type:real" json:"budget,omitempty"`
	DurationDays    int
	Status          string             `gorm:"type:text;default:'planning'" json:"status"`
	Characteristics map[string]string  `gorm:"type:json" json:"characteristics,omitempty"`
	CreatedAt       time.Time          `gorm:"autoCreateTime" json:"created_at,omitempty"`
}

// BeforeCreate — генерация UUID перед сохранением
func (p *ProjectObject) BeforeCreate() error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return nil
}