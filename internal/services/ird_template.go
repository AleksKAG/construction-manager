// internal/services/ird_template.go
package services

import (
	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/sirupsen/logrus"
)

func EnsureIrdTemplate(repo repository.Repository, logger *logrus.Logger) error {
	db := repo.RawDB()
	
	// Создаём шаблон
	if err := db.Where("code = ?", "input_design_data").FirstOrCreate(
		&models.TemplateDefinition{
			Code:        "input_design_data",
			Name:        "ИРД — исходные данные",
			Description: "ГПЗУ, ТЗ, МТЗ, ТУ",
		}).Error; err != nil {
		return err
	}
	
	// Колонки шаблона
	cols := []models.TemplateColumn{
		{TemplateCode: "input_design_data", FieldKey: "doc_type", Title: "Тип документа", DataType: "select", SortOrder: 1},
		{TemplateCode: "input_design_data", FieldKey: "doc_number", Title: "Номер", DataType: "text", SortOrder: 2},
		{TemplateCode: "input_design_data", FieldKey: "issue_date", Title: "Дата выдачи", DataType: "date", SortOrder: 3},
		{TemplateCode: "input_design_data", FieldKey: "expiry_date", Title: "Срок действия", DataType: "date", SortOrder: 4},
		{TemplateCode: "input_design_data", FieldKey: "status", Title: "Статус", DataType: "select", SortOrder: 5},
		{TemplateCode: "input_design_data", FieldKey: "issuer", Title: "Выдавший орган", DataType: "text", SortOrder: 6},
		{TemplateCode: "input_design_data", FieldKey: "notes", Title: "Примечание", DataType: "text", SortOrder: 7},
		{TemplateCode: "input_design_data", FieldKey: "file_path", Title: "Файл", DataType: "text", SortOrder: 8},
	}
	for i := range cols {
		db.Where("template_code = ? AND field_key = ?", cols[i].TemplateCode, cols[i].FieldKey).FirstOrCreate(&cols[i])
	}
	return nil
}