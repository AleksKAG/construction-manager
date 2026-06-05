package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AIConversation stores an AI assistant chat thread owned by a user and optionally linked to a project/object.
type AIConversation struct {
	ID          string      `gorm:"primaryKey;type:text" json:"id"`
	UserID      string      `gorm:"type:text;not null;index:idx_ai_conversations_user_project,priority:1" json:"user_id"`
	ProjectID   string      `gorm:"type:text;index:idx_ai_conversations_user_project,priority:2" json:"project_id,omitempty"`
	ProjectName string      `gorm:"type:text" json:"project_name,omitempty"`
	Title       string      `gorm:"type:text;not null;default:'Новая беседа'" json:"title"`
	Metadata    JSONMap     `gorm:"type:jsonb;serializer:json" json:"metadata,omitempty"`
	Messages    []AIMessage `gorm:"foreignKey:ConversationID" json:"messages,omitempty"`
	CreatedAt   time.Time   `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time   `gorm:"autoUpdateTime;index" json:"updated_at"`
}

func (AIConversation) TableName() string { return "ai_conversations" }

func (c *AIConversation) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.NewString()
	}
	if c.Title == "" {
		c.Title = "Новая беседа"
	}
	return nil
}

// AIMessage stores a single user/assistant message in a conversation.
type AIMessage struct {
	ID             string    `gorm:"primaryKey;type:text" json:"id"`
	ConversationID string    `gorm:"type:text;not null;index" json:"conversation_id"`
	UserID         string    `gorm:"type:text;not null;index" json:"user_id"`
	Role           string    `gorm:"type:varchar(20);not null" json:"role"`
	Text           string    `gorm:"type:text;not null" json:"text"`
	Metadata       JSONMap   `gorm:"type:jsonb;serializer:json" json:"metadata,omitempty"`
	CreatedAt      time.Time `gorm:"autoCreateTime;index" json:"created_at"`
}

func (AIMessage) TableName() string { return "ai_messages" }

func (m *AIMessage) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	return nil
}
