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

func ListProjectMenu(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		
		// Проверка существования таблицы menu_items
		if !repo.RawDB().Migrator().HasTable(&models.MenuItem{}) {
			// Возвращаем дефолтное меню, если таблица не существует
			defaultMenu := []menuNode{
				{ID: "design", Title: "Проектирование", ItemType: "section", Children: []menuNode{
					{ID: "ird", Title: "ИРД", ItemType: "link", ViewKey: "ird"},
					{ID: "tep", Title: "ТЭП", ItemType: "link", ViewKey: "tep"},
				}},
				{ID: "smr", Title: "СМР", ItemType: "section", Children: []menuNode{
					{ID: "ssr", Title: "ССР", ItemType: "link", ViewKey: "ssr"},
					{ID: "schedule", Title: "График", ItemType: "link", ViewKey: "schedule"},
				}},
				{ID: "docs", Title: "Документация", ItemType: "link", ViewKey: "docs"},
			}
			c.JSON(http.StatusOK, gin.H{"data": defaultMenu})
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
