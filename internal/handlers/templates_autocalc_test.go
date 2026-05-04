package handlers

import "testing"

func TestNormalizeScheduleTriplet_FillsDays(t *testing.T) {
	values := map[string]string{"baseline_start": "2026-05-01", "baseline_end": "2026-05-11"}
	normalizeScheduleTriplet(values, "baseline_start", "baseline_end", "baseline_days")
	if values["baseline_days"] != "10" {
		t.Fatalf("expected 10 days, got %q", values["baseline_days"])
	}
}

func TestNormalizeScheduleTriplet_FillsEnd(t *testing.T) {
	values := map[string]string{"fact_start": "2026-05-01", "fact_days": "5"}
	normalizeScheduleTriplet(values, "fact_start", "fact_end", "fact_days")
	if values["fact_end"] != "2026-05-06" {
		t.Fatalf("expected computed end date, got %q", values["fact_end"])
	}
}

func TestNormalizeScheduleTriplet_FillsStart(t *testing.T) {
	values := map[string]string{"fact_end": "2026-05-21", "fact_days": "3"}
	normalizeScheduleTriplet(values, "fact_start", "fact_end", "fact_days")
	if values["fact_start"] != "2026-05-18" {
		t.Fatalf("expected computed start date, got %q", values["fact_start"])
	}
}
