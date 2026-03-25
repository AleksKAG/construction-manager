package models

import "time"

type ProjectObject struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"not null" json:"name"`
	Address     string    `json:"address"`
	Budget      float64   `json:"budget"`
	Status      string    `gorm:"default:'planning'" json:"status"`
	DurationDays int      `gorm:"default:0" json:"duration_days"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
