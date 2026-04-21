package services

import (
	"context"

	"github.com/AleksKAG/construction-manager/internal/models"
	"gorm.io/gorm"
)

func EnsureProjectMenus(ctx context.Context, db *gorm.DB) error {
	var projects []models.ProjectObject
	if err := db.WithContext(ctx).Find(&projects).Error; err != nil {
		return err
	}
	for _, p := range projects {
		if err := EnsureDefaultProjectMenu(db.WithContext(ctx), p.ID); err != nil {
			return err
		}
		if err := EnsureProjectMenuStructure(db.WithContext(ctx), p.ID); err != nil {
			return err
		}
	}
	return nil
}

func EnsureDefaultProjectMenu(db *gorm.DB, projectID string) error {
	var count int64
	if err := db.Model(&models.MenuItem{}).Where("project_id = ?", projectID).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	items := []models.MenuItem{
		{ProjectID: projectID, Title: "Проектирование", ItemType: "section", SortOrder: 10},
		{ProjectID: projectID, Title: "Сметная документация", ItemType: "section", SortOrder: 20},
		{ProjectID: projectID, Title: "СМР", ItemType: "section", SortOrder: 30},
		{ProjectID: projectID, Title: "Ввод в эксплуатацию", ItemType: "section", SortOrder: 40},
		{ProjectID: projectID, Title: "Протоколы совещаний", ItemType: "section", SortOrder: 50},
	}
	for i := range items {
		if err := db.Create(&items[i]).Error; err != nil {
			return err
		}
	}

	children := []models.MenuItem{
		{ProjectID: projectID, ParentID: items[0].ID, Title: "ТЭП", ViewKey: "tep", ItemType: "view", SortOrder: 1},
		{ProjectID: projectID, ParentID: items[0].ID, Title: "График проектирования", ViewKey: "designSchedule", ItemType: "view", SortOrder: 2},
		{ProjectID: projectID, ParentID: items[0].ID, Title: "Документация (Проектирование)", ItemType: "section", SortOrder: 3},

		{ProjectID: projectID, ParentID: items[1].ID, Title: "Сметная документация согласованная в экспертизе", ViewKey: "estimate", ItemType: "view", SortOrder: 1},
		{ProjectID: projectID, ParentID: items[1].ID, Title: "Корректировка смет", ItemType: "section", SortOrder: 2},

		{ProjectID: projectID, ParentID: items[2].ID, Title: "График СМР", ItemType: "view", SortOrder: 1},
		{ProjectID: projectID, ParentID: items[2].ID, Title: "Документация СМР", ItemType: "section", SortOrder: 2},
		{ProjectID: projectID, ParentID: items[2].ID, Title: "Авторский надзор", ItemType: "leaf", SortOrder: 3},
		{ProjectID: projectID, ParentID: items[2].ID, Title: "Технический надзор", ItemType: "leaf", SortOrder: 4},
		{ProjectID: projectID, ParentID: items[2].ID, Title: "График поставки оборудования", ItemType: "leaf", SortOrder: 5},

		{ProjectID: projectID, ParentID: items[3].ID, Title: "График", ItemType: "leaf", SortOrder: 1},
		{ProjectID: projectID, ParentID: items[3].ID, Title: "Документация", ItemType: "leaf", SortOrder: 2},

		{ProjectID: projectID, ParentID: items[4].ID, Title: "Протоколы внутренние", ItemType: "leaf", SortOrder: 1},
		{ProjectID: projectID, ParentID: items[4].ID, Title: "Протоколы проектирование", ItemType: "leaf", SortOrder: 2},
		{ProjectID: projectID, ParentID: items[4].ID, Title: "Протоколы СМР", ItemType: "leaf", SortOrder: 3},
		{ProjectID: projectID, ParentID: items[4].ID, Title: "Добавить раздел протоколов", ItemType: "leaf", SortOrder: 4},
	}
	for i := range children {
		if err := db.Create(&children[i]).Error; err != nil {
			return err
		}
	}

	var docsNode models.MenuItem
	if err := db.Where("project_id = ? AND parent_id = ? AND title = ?", projectID, items[0].ID, "Документация (Проектирование)").First(&docsNode).Error; err != nil {
		return err
	}
	if err := db.Create([]models.MenuItem{
		{ProjectID: projectID, ParentID: docsNode.ID, Title: "ИРД", ItemType: "leaf", SortOrder: 1},
		{ProjectID: projectID, ParentID: docsNode.ID, Title: "Изыскания", ItemType: "leaf", SortOrder: 2},
		{ProjectID: projectID, ParentID: docsNode.ID, Title: "Стадия П", ItemType: "leaf", SortOrder: 3},
		{ProjectID: projectID, ParentID: docsNode.ID, Title: "Экспертиза", ItemType: "leaf", SortOrder: 4},
		{ProjectID: projectID, ParentID: docsNode.ID, Title: "Стадия Р", ItemType: "leaf", SortOrder: 5},
	}).Error; err != nil {
		return err
	}

	var adjustNode models.MenuItem
	if err := db.Where("project_id = ? AND title = ?", projectID, "Корректировка смет").First(&adjustNode).Error; err != nil {
		return err
	}
	return db.Create([]models.MenuItem{
		{ProjectID: projectID, ParentID: adjustNode.ID, Title: "СВОР", ItemType: "leaf", SortOrder: 1},
		{ProjectID: projectID, ParentID: adjustNode.ID, Title: "КАЦ", ItemType: "leaf", SortOrder: 2},
		{ProjectID: projectID, ParentID: adjustNode.ID, Title: "Сметы изм", ItemType: "leaf", SortOrder: 3},
		{ProjectID: projectID, ParentID: adjustNode.ID, Title: "Экспертиза повторная", ItemType: "leaf", SortOrder: 4},
	}).Error
}

func EnsureProjectMenuStructure(db *gorm.DB, projectID string) error {
	designSection, err := ensureMenuItem(db, projectID, "", "Проектирование", "", "section", 10)
	if err != nil {
		return err
	}
	estimateSection, err := ensureMenuItem(db, projectID, "", "Сметная документация", "", "section", 20)
	if err != nil {
		return err
	}
	smrSection, err := ensureMenuItem(db, projectID, "", "СМР", "", "section", 30)
	if err != nil {
		return err
	}
	commissioningSection, err := ensureMenuItem(db, projectID, "", "Ввод в эксплуатацию", "", "section", 40)
	if err != nil {
		return err
	}
	protocolSection, err := ensureMenuItem(db, projectID, "", "Протоколы совещаний", "", "section", 50)
	if err != nil {
		return err
	}

	stageP, err := ensureMenuItem(db, projectID, designSection.ID, "Стадия П", "", "section", 1)
	if err != nil {
		return err
	}
	stageR, err := ensureMenuItem(db, projectID, designSection.ID, "Стадия Р", "", "section", 2)
	if err != nil {
		return err
	}
	expertise, err := ensureMenuItem(db, projectID, designSection.ID, "Экспертиза", "", "section", 3)
	if err != nil {
		return err
	}
	designDocs, err := ensureMenuItem(db, projectID, designSection.ID, "Документация (Проектирование)", "", "section", 91)
	if err != nil {
		return err
	}

	_, _ = ensureMenuItem(db, projectID, stageP.ID, "ИРД", "template:ird", "view", 1)
	_, _ = ensureMenuItem(db, projectID, stageP.ID, "ТЭП", "tep", "view", 2)
	_, _ = ensureMenuItem(db, projectID, stageP.ID, "Ведомость комплектов ПД", "registryP", "view", 3)
	_, _ = ensureMenuItem(db, projectID, stageP.ID, "График ПД", "designSchedule", "view", 4)
	_, _ = ensureMenuItem(db, projectID, stageP.ID, "Изыскания", "template:surveys", "view", 5)

	_, _ = ensureMenuItem(db, projectID, stageR.ID, "Ведомость комплектов РД", "registryR", "view", 1)
	_, _ = ensureMenuItem(db, projectID, stageR.ID, "График РД", "designScheduleR", "view", 2)

	_, _ = ensureMenuItem(db, projectID, expertise.ID, "Заключение П", "template:expertise_p", "view", 1)
	_, _ = ensureMenuItem(db, projectID, expertise.ID, "Замечания/Ответы", "template:expertise_remarks", "view", 2)
	_ = db.Where("project_id = ? AND parent_id = ? AND title = ?", projectID, expertise.ID, "Заключение Р").Delete(&models.MenuItem{}).Error

	_, _ = ensureMenuItem(db, projectID, designDocs.ID, "ИРД (архив)", "docsArchiveIrd", "view", 1)
	_, _ = ensureMenuItem(db, projectID, designDocs.ID, "Изыскания (архив)", "docsArchiveSurvey", "view", 2)
	_, _ = ensureMenuItem(db, projectID, designDocs.ID, "Стадия П (архив)", "docsArchiveStageP", "view", 3)
	_, _ = ensureMenuItem(db, projectID, designDocs.ID, "Экспертиза (архив)", "docsArchiveExpertise", "view", 4)
	_, _ = ensureMenuItem(db, projectID, designDocs.ID, "Стадия Р (архив)", "docsArchiveStageR", "view", 5)
	_, _ = ensureMenuItem(db, projectID, designDocs.ID, "Шаблоны документов", "docsTemplates", "view", 6)

	_, _ = ensureMenuItem(db, projectID, estimateSection.ID, "ССР", "template:estimate_ssr", "view", 1)
	_, _ = ensureMenuItem(db, projectID, estimateSection.ID, "Главы", "template:estimate_chapters", "view", 2)
	_, _ = ensureMenuItem(db, projectID, estimateSection.ID, "Объекты", "template:estimate_objects", "view", 3)
	_, _ = ensureMenuItem(db, projectID, estimateSection.ID, "Локальные сметы", "template:estimate_local", "view", 4)
	_, _ = ensureMenuItem(db, projectID, estimateSection.ID, "Ведомости объёмов", "template:estimate_volumes", "view", 5)
	_, _ = ensureMenuItem(db, projectID, estimateSection.ID, "КАЦ", "template:estimate_kac", "view", 6)
	_, _ = ensureMenuItem(db, projectID, estimateSection.ID, "СВОР", "svorMain", "view", 7)

	_, _ = ensureMenuItem(db, projectID, smrSection.ID, "График СМР", "smrSchedule", "view", 1)
	_, _ = ensureMenuItem(db, projectID, smrSection.ID, "Учёт рабочих", "workforceDaily", "view", 2)

	_, _ = ensureMenuItem(db, projectID, commissioningSection.ID, "Документация ввода", "template:commissioning_docs", "view", 1)

	_, _ = ensureMenuItem(db, projectID, protocolSection.ID, "Внутренние", "protocolInternal", "view", 1)
	_, _ = ensureMenuItem(db, projectID, protocolSection.ID, "Проектирование", "protocolDesign", "view", 2)
	_, _ = ensureMenuItem(db, projectID, protocolSection.ID, "СМР", "protocolSMR", "view", 3)

	// Backward compatibility with already existing shortcuts.
	_, _ = ensureMenuItem(db, projectID, designSection.ID, "График проектирования", "designSchedule", "view", 90)

	return nil
}

func ensureMenuItem(db *gorm.DB, projectID, parentID, title, viewKey, itemType string, sortOrder int) (*models.MenuItem, error) {
	var item models.MenuItem
	err := db.Where("project_id = ? AND parent_id = ? AND title = ?", projectID, parentID, title).First(&item).Error
	if err == nil {
		if err := db.Model(&item).Updates(map[string]any{
			"view_key":   viewKey,
			"item_type":  itemType,
			"sort_order": sortOrder,
		}).Error; err != nil {
			return nil, err
		}
		item.ViewKey = viewKey
		item.ItemType = itemType
		item.SortOrder = sortOrder
		return &item, nil
	}

	item = models.MenuItem{
		ProjectID: projectID,
		ParentID:  parentID,
		Title:     title,
		ViewKey:   viewKey,
		ItemType:  itemType,
		SortOrder: sortOrder,
	}
	if err := db.Create(&item).Error; err != nil {
		return nil, err
	}
	return &item, nil
}
