package services

import (
	"context"
	"github.com/AleksKAG/ai-construction-manager/internal/models"
	"github.com/AleksKAG/ai-construction-manager/internal/repository"
)

func LoadSampleData(repo *repository.ProjectRepository) {
	ctx := context.Background()
	
	// Проверяем, есть ли уже данные
	var count int64
	repo.DB.Model(&models.ProjectObject{}).Count(&count)
	if count > 0 {
		return
	}

	sampleProjects := []*models.ProjectObject{
		{
			Name:         "Строительство жилого дома на 120 квартир",
			Address:      "Москва, ул. Ленина, 45",
			Budget:       245000000,
			DurationDays: 420,
			Status:       "planning",
		},
		{
			Name:         "Реконструкция офисного здания",
			Address:      "Санкт-Петербург, Невский пр., 78",
			Budget:       87500000,
			DurationDays: 280,
			Status:       "active",
		},
		{
			Name:         "Строительство логистического склада",
			Address:      "Краснодарский край, ст. Динская",
			Budget:       156000000,
			DurationDays: 365,
			Status:       "planning",
		},
	}

	for _, project := range sampleProjects {
		_ = repo.Create(ctx, project)
	}
}