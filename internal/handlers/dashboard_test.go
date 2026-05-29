package handlers

import (
	"testing"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/gin-gonic/gin"
)

func TestDashboardWidgetFilteringForViewerMarksReadOnly(t *testing.T) {
	widgets := []gin.H{{"code": "tep"}, {"code": "budget_evm"}}
	ginWidgets := makeDashboardTestWidgets(widgets)
	filtered := filterDashboardWidgetsForRole(ginWidgets, "viewer")
	if len(filtered) != 2 {
		t.Fatalf("expected 2 widgets, got %d", len(filtered))
	}
	for _, widget := range filtered {
		if readonly, _ := widget["readonly"].(bool); !readonly {
			t.Fatalf("expected widget %v to be readonly", widget["code"])
		}
	}
}

func TestDashboardDelayCalculation(t *testing.T) {
	tasks := []models.GanttTask{{Status: "overdue", EndDate: "2020-01-01", Progress: 50}}
	if countDelayedTasks(tasks) != 1 {
		t.Fatal("expected one delayed task")
	}
	if maxDelayDays(tasks) <= 0 {
		t.Fatal("expected positive max delay days")
	}
}

func makeDashboardTestWidgets(input []gin.H) []gin.H {
	out := make([]gin.H, len(input))
	copy(out, input)
	return out
}
