package services

import (
	"context"
	"fmt"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/sirupsen/logrus"
)

func LoadSampleData(repo repository.Repository, logger *logrus.Logger) error {
	ctx := context.Background()

	// Проверяем, есть ли уже данные
	var count int64
	if err := repo.RawDB().Model(&models.ProjectObject{}).Count(&count).Error; err != nil {
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
				"этажность":      "25",
				"площадь":        "12000 м²",
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
				"площадь":             "25000 м²",
				"высота_потолков":     "12 м",
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
		if err := repo.CreateProjectLegacy(ctx, project); err != nil {
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

func LoadStandardTemplates(repo repository.Repository, logger *logrus.Logger) error {
	ctx := context.Background()

	templates := []models.TemplateDefinition{
		{Code: "input_design_data", Name: "Исходные данные для проектирования", Description: "Шаблон ИДП"},
		{Code: "design_schedule", Name: "График разработки проектной документации", Description: "Шаблон графика ПД"},
		{Code: "tep", Name: "Технико-экономические показатели", Description: "Шаблон ТЭП"},
		{Code: "summary_estimate", Name: "Сводный расчет", Description: "Сводный сметный расчет"},
		{Code: "smr_schedule", Name: "График строительно-монтажных работ", Description: "Шаблон СМР"},
		{Code: "docs", Name: "Документы", Description: "Документы проекта"},
	}
	// Do not skip seeding just because older migrations inserted legacy templates.
	// Existing databases can contain tep/schedule/ird but miss design_schedule,
	// which makes the PD/RD schedule menu items resolve to a missing template.
	createdTemplates := 0
	updatedTemplates := 0
	for _, tpl := range templates {
		var existing models.TemplateDefinition
		result := repo.RawDB().WithContext(ctx).Where("code = ?", tpl.Code).Find(&existing)
		if result.Error != nil {
			return fmt.Errorf("failed to load template %s: %w", tpl.Code, result.Error)
		}
		if result.RowsAffected > 0 {
			if err := repo.RawDB().WithContext(ctx).Model(&existing).Updates(map[string]any{
				"name":        tpl.Name,
				"description": tpl.Description,
			}).Error; err != nil {
				return fmt.Errorf("failed to update template %s: %w", tpl.Code, err)
			}
			updatedTemplates++
			continue
		}

		t := tpl
		if err := repo.RawDB().WithContext(ctx).Create(&t).Error; err != nil {
			return fmt.Errorf("failed to create template %s: %w", t.Code, err)
		}
		createdTemplates++
	}

	columns := []models.TemplateColumn{
		{TemplateCode: "input_design_data", FieldKey: "num", Title: "№", DataType: "text", SortOrder: 1},
		{TemplateCode: "input_design_data", FieldKey: "name", Title: "Наименование", DataType: "text", Required: true, SortOrder: 2},
		{TemplateCode: "input_design_data", FieldKey: "issue_date", Title: "Дата выдачи", DataType: "date", SortOrder: 3},
		{TemplateCode: "input_design_data", FieldKey: "valid_until", Title: "Срок действия", DataType: "date", SortOrder: 4},
		{TemplateCode: "input_design_data", FieldKey: "note", Title: "Примечание", DataType: "text", SortOrder: 5},

		{TemplateCode: "design_schedule", FieldKey: "volume_no", Title: "№ тома", DataType: "text", Required: true, SortOrder: 1},
		{TemplateCode: "design_schedule", FieldKey: "code", Title: "Обозначение", DataType: "text", Required: true, SortOrder: 2},
		{TemplateCode: "design_schedule", FieldKey: "name", Title: "Наименование", DataType: "text", Required: true, SortOrder: 3},
		{TemplateCode: "design_schedule", FieldKey: "executor", Title: "Исполнитель", DataType: "text", SortOrder: 4},
		{TemplateCode: "design_schedule", FieldKey: "baseline_start", Title: "Дата начала базовая", DataType: "date", SortOrder: 5},
		{TemplateCode: "design_schedule", FieldKey: "baseline_end", Title: "Дата выдачи базовая", DataType: "date", SortOrder: 6},
		{TemplateCode: "design_schedule", FieldKey: "baseline_days", Title: "Дней разработки база", DataType: "number", SortOrder: 7},
		{TemplateCode: "design_schedule", FieldKey: "fact_start", Title: "Дата начала факт", DataType: "date", SortOrder: 8},
		{TemplateCode: "design_schedule", FieldKey: "fact_end", Title: "Дата выдачи факт", DataType: "date", SortOrder: 9},
		{TemplateCode: "design_schedule", FieldKey: "fact_days", Title: "Дней разработки факт", DataType: "number", SortOrder: 10},
		{TemplateCode: "design_schedule", FieldKey: "progress", Title: "% завершения", DataType: "number", SortOrder: 11},

		{TemplateCode: "tep", FieldKey: "num", Title: "№", DataType: "text", SortOrder: 1},
		{TemplateCode: "tep", FieldKey: "indicator", Title: "Показатель", DataType: "text", Required: true, SortOrder: 2},
		{TemplateCode: "tep", FieldKey: "unit", Title: "Единица измерения", DataType: "text", SortOrder: 3},
		{TemplateCode: "tep", FieldKey: "amount", Title: "Кол-во", DataType: "number", SortOrder: 4},

		{TemplateCode: "summary_estimate", FieldKey: "num", Title: "№ п/п", DataType: "text", SortOrder: 1},
		{TemplateCode: "summary_estimate", FieldKey: "basis", Title: "Обоснование", DataType: "text", SortOrder: 2},
		{TemplateCode: "summary_estimate", FieldKey: "work_name", Title: "Наименование работ и затрат", DataType: "text", Required: true, SortOrder: 3},
		{TemplateCode: "summary_estimate", FieldKey: "build_cost", Title: "Строительных работ, тыс. руб.", DataType: "number", SortOrder: 4},
		{TemplateCode: "summary_estimate", FieldKey: "install_cost", Title: "Монтажных работ, тыс. руб.", DataType: "number", SortOrder: 5},
		{TemplateCode: "summary_estimate", FieldKey: "equip_cost", Title: "Оборудования, тыс. руб.", DataType: "number", SortOrder: 6},
		{TemplateCode: "summary_estimate", FieldKey: "other_cost", Title: "Прочих затрат, тыс. руб.", DataType: "number", SortOrder: 7},
		{TemplateCode: "summary_estimate", FieldKey: "total_cost", Title: "Всего, тыс. руб.", DataType: "number", SortOrder: 8},

		{TemplateCode: "smr_schedule", FieldKey: "num", Title: "№", DataType: "text", SortOrder: 1},
		{TemplateCode: "smr_schedule", FieldKey: "task_name", Title: "Название задачи", DataType: "text", Required: true, SortOrder: 2},
		{TemplateCode: "smr_schedule", FieldKey: "contractor", Title: "Контрагент", DataType: "text", SortOrder: 3},
		{TemplateCode: "smr_schedule", FieldKey: "contract_start", Title: "Базовое начало по договору", DataType: "date", SortOrder: 4},
		{TemplateCode: "smr_schedule", FieldKey: "contract_end", Title: "Базовое окончание по договору", DataType: "date", SortOrder: 5},
		{TemplateCode: "smr_schedule", FieldKey: "progress", Title: "% завершения", DataType: "number", SortOrder: 6},
		{TemplateCode: "smr_schedule", FieldKey: "duration", Title: "Длительность", DataType: "number", SortOrder: 7},
		{TemplateCode: "smr_schedule", FieldKey: "fact_start", Title: "Начало", DataType: "date", SortOrder: 8},
		{TemplateCode: "smr_schedule", FieldKey: "fact_end", Title: "Окончание факт", DataType: "date", SortOrder: 9},
		{TemplateCode: "smr_schedule", FieldKey: "finish_deviation", Title: "Отклонение окончания", DataType: "number", SortOrder: 10},

		// Docs template columns
		{TemplateCode: "docs", FieldKey: "doc_type", Title: "Тип документа", DataType: "text", Required: true, SortOrder: 1},
		{TemplateCode: "docs", FieldKey: "doc_number", Title: "Номер документа", DataType: "text", SortOrder: 2},
		{TemplateCode: "docs", FieldKey: "issue_date", Title: "Дата выдачи", DataType: "date", SortOrder: 3},
		{TemplateCode: "docs", FieldKey: "expiry_date", Title: "Срок действия", DataType: "date", SortOrder: 4},
		{TemplateCode: "docs", FieldKey: "status", Title: "Статус", DataType: "text", SortOrder: 5},
		{TemplateCode: "docs", FieldKey: "issuer", Title: "Выдавший орган", DataType: "text", SortOrder: 6},
		{TemplateCode: "docs", FieldKey: "notes", Title: "Примечания", DataType: "text", SortOrder: 7},
	}

	createdColumns := 0
	updatedColumns := 0
	for _, col := range columns {
		var existing models.TemplateColumn
		result := repo.RawDB().WithContext(ctx).Where("template_code = ? AND field_key = ?", col.TemplateCode, col.FieldKey).Find(&existing)
		if result.Error != nil {
			return fmt.Errorf("failed to load template column %s/%s: %w", col.TemplateCode, col.FieldKey, result.Error)
		}
		if result.RowsAffected > 0 {
			if err := repo.RawDB().WithContext(ctx).Model(&existing).Updates(map[string]any{
				"title":      col.Title,
				"data_type":  col.DataType,
				"required":   col.Required,
				"sort_order": col.SortOrder,
			}).Error; err != nil {
				return fmt.Errorf("failed to update template column %s/%s: %w", col.TemplateCode, col.FieldKey, err)
			}
			updatedColumns++
			continue
		}

		c := col
		if err := repo.RawDB().WithContext(ctx).Create(&c).Error; err != nil {
			return fmt.Errorf("failed to create template column %s/%s: %w", c.TemplateCode, c.FieldKey, err)
		}
		createdColumns++
	}

	logger.Infof("Standard templates ensured (templates created=%d updated=%d, columns created=%d updated=%d)", createdTemplates, updatedTemplates, createdColumns, updatedColumns)
	return nil
}
