package handlers

import (
	"testing"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
)

func TestProjectStatusTransitions(t *testing.T) {
	if !isAllowedProjectStatusTransition("draft", "design") {
		t.Fatal("expected draft -> design to be allowed")
	}
	if isAllowedProjectStatusTransition("draft", "construction") {
		t.Fatal("expected draft -> construction to be rejected")
	}
	if isAllowedProjectStatusTransition("completed", "commissioning") {
		t.Fatal("expected completed project to reject backwards transition")
	}
}

func TestValidateProjectRequired(t *testing.T) {
	start := time.Date(2026, 5, 29, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(1, 0, 0)
	project := &models.Project{
		Name:           "Онкологический центр",
		Address:        "Пермь",
		BudgetTotal:    100,
		StartDate:      &start,
		PlannedEndDate: &end,
		RegionCode:     "59",
	}
	if err := validateProjectRequired(project); err != nil {
		t.Fatalf("expected valid project, got %v", err)
	}
	project.BudgetTotal = 0
	if err := validateProjectRequired(project); err == nil {
		t.Fatal("expected budget validation error")
	}
}
