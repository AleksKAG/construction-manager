package handlers

import (
	"net/http"
	"sort"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

type menuNode struct {
	ID       string     `json:"id"`
	Title    string     `json:"title"`
	ViewKey  string     `json:"view_key,omitempty"`
	ItemType string     `json:"item_type"`
	Children []menuNode `json:"children,omitempty"`
}

func defaultProjectMenuFallback() []menuNode {
	return []menuNode{
		{ID: "design", Title: "Проектирование", ItemType: "section", Children: []menuNode{
			{ID: "stage-p", Title: "Стадия П", ItemType: "section", Children: []menuNode{
				{ID: "ird", Title: "ИРД", ItemType: "view", ViewKey: "template:ird"},
				{ID: "tep", Title: "ТЭП", ItemType: "view", ViewKey: "tep"},
				{ID: "registry-p", Title: "Ведомость комплектов ПД", ItemType: "view", ViewKey: "registryP"},
				{ID: "schedule-p", Title: "График ПД", ItemType: "view", ViewKey: "designSchedule"},
			}},
			{ID: "stage-r", Title: "Стадия Р", ItemType: "section", Children: []menuNode{
				{ID: "registry-r", Title: "Ведомость комплектов РД", ItemType: "view", ViewKey: "registryR"},
				{ID: "schedule-r", Title: "График РД", ItemType: "view", ViewKey: "designScheduleR"},
			}},
			{ID: "docs-templates", Title: "Шаблоны документов", ItemType: "view", ViewKey: "docsTemplates"},
		}},
		{ID: "estimate", Title: "Сметная документация", ItemType: "section", Children: []menuNode{
			{ID: "estimate-ssr", Title: "ССР", ItemType: "view", ViewKey: "template:estimate_ssr"},
			{ID: "svor", Title: "СВОР", ItemType: "view", ViewKey: "svorMain"},
		}},
		{ID: "smr", Title: "СМР", ItemType: "section", Children: []menuNode{
			{ID: "smr-schedule", Title: "График СМР", ItemType: "view", ViewKey: "smrSchedule"},
			{ID: "workforce", Title: "Учёт рабочих", ItemType: "view", ViewKey: "workforceDaily"},
		}},
	}
}

func ListProjectMenu(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")

		// Проверка существования таблицы menu_items
		if !repo.RawDB().Migrator().HasTable(&models.MenuItem{}) {
			// Возвращаем рабочее MVP-меню с теми же view_key, которые использует фронтенд,
			// если таблица menu_items еще не создана.
			c.JSON(http.StatusOK, gin.H{"data": defaultProjectMenuFallback()})
			return
		}

		var items []models.MenuItem
		if err := repo.RawDB().WithContext(c.Request.Context()).
			Where("project_id = ?", projectID).
			Order("sort_order asc, title asc").
			Find(&items).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		byParent := map[string][]models.MenuItem{}
		for _, item := range items {
			byParent[item.ParentID] = append(byParent[item.ParentID], item)
		}

		var build func(parent string) []menuNode
		build = func(parent string) []menuNode {
			src := byParent[parent]
			sort.SliceStable(src, func(i, j int) bool {
				if src[i].SortOrder == src[j].SortOrder {
					return src[i].Title < src[j].Title
				}
				return src[i].SortOrder < src[j].SortOrder
			})
			out := make([]menuNode, 0, len(src))
			for _, item := range src {
				out = append(out, menuNode{
					ID:       item.ID,
					Title:    item.Title,
					ViewKey:  item.ViewKey,
					ItemType: item.ItemType,
					Children: build(item.ID),
				})
			}
			return out
		}

		c.JSON(http.StatusOK, gin.H{"data": build("")})
	}
}
