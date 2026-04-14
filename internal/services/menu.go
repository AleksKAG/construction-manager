package services

import (
	"context"
	"errors"
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
	var designSection models.MenuItem
	if err := db.Where("project_id = ? AND parent_id = ? AND title = ?", projectID, "", "Проектирование").First(&designSection).Error; err != nil {
		return nil
	}

	var tepItem models.MenuItem
	if err := db.Where("project_id = ? AND parent_id = ? AND title = ?", projectID, designSection.ID, "ТЭП").First(&tepItem).Error; err != nil {
		if err := db.Create(&models.MenuItem{
			ProjectID: projectID,
			ParentID:  designSection.ID,
			Title:     "ТЭП",
			ViewKey:   "tep",
			ItemType:  "view",
			SortOrder: 1,
		}).Error; err != nil {
			return err
		}
	} else if tepItem.ViewKey != "tep" || tepItem.SortOrder != 1 {
		if err := db.Model(&tepItem).Updates(map[string]any{"view_key": "tep", "sort_order": 1, "item_type": "view"}).Error; err != nil {
			return err
		}
	}

	if err := db.Model(&models.MenuItem{}).
		Where("project_id = ? AND parent_id = ? AND title = ?", projectID, designSection.ID, "График проектирования").
		Updates(map[string]any{"sort_order": 2, "view_key": "designSchedule", "item_type": "view"}).Error; err != nil {
		return err
	}

	var docsNode models.MenuItem
	if err := db.Where("project_id = ? AND title = ?", projectID, "Документация (Проектирование)").First(&docsNode).Error; err == nil {
		_ = ensureMenuItem(db, projectID, docsNode.ID, "Стадия П", "docsStageP", "view", 3)
		_ = ensureMenuItem(db, projectID, docsNode.ID, "Стадия Р", "docsStageR", "view", 5)
	}

	var adjustNode models.MenuItem
	if err := db.Where("project_id = ? AND title = ?", projectID, "Корректировка смет").First(&adjustNode).Error; err == nil {
		_ = ensureMenuItem(db, projectID, adjustNode.ID, "СВОР", "svorMain", "view", 1)
		_ = ensureMenuItem(db, projectID, adjustNode.ID, "История согласований", "svorHistory", "view", 2)
		_ = ensureMenuItem(db, projectID, adjustNode.ID, "Сводный дашборд по СВОР", "svorDashboard", "view", 3)
	}

	return nil
}

func ensureMenuItem(db *gorm.DB, projectID, parentID, title, viewKey, itemType string, sortOrder int) error {
	var item models.MenuItem
	err := db.Where("project_id = ? AND parent_id = ? AND title = ?", projectID, parentID, title).First(&item).Error
	if err == nil {
		return db.Model(&item).Updates(map[string]any{
			"view_key":   viewKey,
			"item_type":  itemType,
			"sort_order": sortOrder,
		}).Error
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return db.Create(&models.MenuItem{
		ProjectID: projectID,
		ParentID:  parentID,
		Title:     title,
		ViewKey:   viewKey,
		ItemType:  itemType,
		SortOrder: sortOrder,
	}).Error
}
