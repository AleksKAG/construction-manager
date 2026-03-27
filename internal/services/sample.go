package services

import (
	"context"
	"fmt"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/sirupsen/logrus"
)

func LoadSampleData(repo *repository.ProjectRepository, logger *logrus.Logger) error {
	ctx := context.Background()

	// Проверяем, есть ли уже данные
	var count int64
	if err := repo.DB.Model(&models.ProjectObject{}).Count(&count).Error; err != nil {
		return fmt.Errorf("failed to count projects: %w", err)
	}
	if count > 0 {
		logger.Infof("Sample data already exists (%d projects), skipping", count)
		return nil
	}

	sampleProjects := []*models.ProjectObject{
		{
			Name:         "Строительство жилого дома на 120 квартир",
			Address:      "Москва, ул. Ленина, 45",
			Budget:       245000000,
			DurationDays: 420,
			Status:       "planning",
			CharMap: map[string]string{
				"этажность":     "25",
				"площадь":       "12000 м²",
				"тип_фундамента": "свайный",
			},
			CostMap: map[string]float64{
				"материалы": 120000000,
				"работа":    80000000,
				"накладные": 45000000,
			},
		},
		{
			Name:         "Реконструкция офисного здания",
			Address:      "Санкт-Петербург, Невский пр., 78",
			Budget:       87500000,
			DurationDays: 280,
			Status:       "active",
			CharMap: map[string]string{
				"этажность":     "12",
				"площадь":       "8500 м²",
				"год_постройки": "1985",
			},
			CostMap: map[string]float64{
				"материалы": 40000000,
				"работа":    35000000,
				"накладные": 12500000,
			},
		},
		{
			Name:         "Строительство логистического склада",
			Address:      "Краснодарский край, ст. Динская",
			Budget:       156000000,
			DurationDays: 365,
			Status:       "planning",
			CharMap: map[string]string{
				"площадь":       "25000 м²",
				"высота_потолков": "12 м",
				"температурный_режим": "+5°C",
			},
			CostMap: map[string]float64{
				"материалы": 80000000,
				"работа":    50000000,
				"накладные": 26000000,
			},
		},
	}

	for i, project := range sampleProjects {
		if err := repo.Create(ctx, project); err != nil {
			return fmt.Errorf("failed to create sample project %d (%s): %w", i+1, project.Name, err)
		}
		logger.Infof("Created sample project: %s", project.Name)
	}

	// Создаём тестовые задачи для первого проекта
	if len(sampleProjects) > 0 {
		firstProjectID := sampleProjects[0].ID
		sampleTasks := []*models.GanttTask{
			{
				ObjectID:  firstProjectID,
				Name:      "Подготовительные работы",
				StartDate: "2026-01-15",
				EndDate:   "2026-02-28",
				Duration:  45,
				Progress:  100,
				Status:    "завершено",
			},
			{
				ObjectID:  firstProjectID,
				Name:      "Нулевой цикл",
				StartDate: "2026-03-01",
				EndDate:   "2026-05-31",
				Duration:  92,
				Progress:  60,
				Status:    "в работе",
			},
			{
				ObjectID:  firstProjectID,
				Name:      "Возведение каркаса",
				StartDate: "2026-06-01",
				EndDate:   "2026-10-31",
				Duration:  153,
				Progress:  0,
				Status:    "не начато",
			},
		}

		for _, task := range sampleTasks {
			if err := repo.CreateTask(ctx, task); err != nil {
				logger.Warnf("Failed to create sample task %s: %v", task.Name, err)
			}
		}
		logger.Info("Created sample tasks for first project")
	}

	logger.Info("Sample data loaded successfully")
	return nil
}
