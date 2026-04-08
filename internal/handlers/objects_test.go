package handlers

import (
	"testing"

	"github.com/AleksKAG/construction-manager/internal/models"
)

func TestApplyProjectObjectPatch_OnlyProvidedFieldsUpdated(t *testing.T) {
	existing := &models.ProjectObject{
		Name:         "Object A",
		Address:      "Address A",
		Budget:       100,
		Status:       "planning",
		DurationDays: 120,
		CharMap:      map[string]string{"stage": "design"},
		CostMap:      map[string]float64{"smr": 50},
	}

	newName := "Object B"
	newBudget := 0.0
	emptyAddress := ""
	patch := projectObjectUpdatePayload{
		Name:    &newName,
		Budget:  &newBudget,
		Address: &emptyAddress,
	}

	applyProjectObjectPatch(existing, patch)

	if existing.Name != "Object B" {
		t.Fatalf("name not updated, got %q", existing.Name)
	}
	if existing.Budget != 0 {
		t.Fatalf("budget should support zero update, got %v", existing.Budget)
	}
	if existing.Address != "" {
		t.Fatalf("address should support empty string update, got %q", existing.Address)
	}
	if existing.Status != "planning" {
		t.Fatalf("status should remain unchanged, got %q", existing.Status)
	}
}

func TestApplyGanttTaskPatch_DoesNotResetProgressWhenFieldMissing(t *testing.T) {
	existing := &models.GanttTask{
		Name:      "Task A",
		StartDate: "2026-04-01",
		EndDate:   "2026-04-30",
		Duration:  30,
		Progress:  55.5,
		Status:    "in_progress",
	}

	newName := "Task B"
	patch := ganttTaskUpdatePayload{Name: &newName}

	applyGanttTaskPatch(existing, patch)

	if existing.Name != "Task B" {
		t.Fatalf("name not updated, got %q", existing.Name)
	}
	if existing.Progress != 55.5 {
		t.Fatalf("progress should remain unchanged, got %v", existing.Progress)
	}
}

func TestApplyGanttTaskPatch_AllowsZeroValues(t *testing.T) {
	existing := &models.GanttTask{Duration: 10, Progress: 80}

	zeroDuration := 0
	zeroProgress := 0.0
	patch := ganttTaskUpdatePayload{
		Duration: &zeroDuration,
		Progress: &zeroProgress,
	}

	applyGanttTaskPatch(existing, patch)

	if existing.Duration != 0 {
		t.Fatalf("duration should support zero update, got %d", existing.Duration)
	}
	if existing.Progress != 0 {
		t.Fatalf("progress should support zero update, got %v", existing.Progress)
	}
}
