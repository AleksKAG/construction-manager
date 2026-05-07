package handlers

import "testing"

func findFallbackMenuNode(nodes []menuNode, path ...string) (menuNode, bool) {
	if len(path) == 0 {
		return menuNode{}, false
	}
	for _, node := range nodes {
		if node.Title != path[0] {
			continue
		}
		if len(path) == 1 {
			return node, true
		}
		return findFallbackMenuNode(node.Children, path[1:]...)
	}
	return menuNode{}, false
}

func TestDefaultProjectMenuFallback_SplitsDesignSchedulesByStage(t *testing.T) {
	menu := defaultProjectMenuFallback()

	scheduleP, ok := findFallbackMenuNode(menu, "Проектирование", "Стадия П", "График ПД")
	if !ok {
		t.Fatal("expected fallback menu to include PD schedule path")
	}
	if scheduleP.ViewKey != "designSchedule" {
		t.Fatalf("expected designSchedule view key, got %q", scheduleP.ViewKey)
	}

	scheduleR, ok := findFallbackMenuNode(menu, "Проектирование", "Стадия Р", "График РД")
	if !ok {
		t.Fatal("expected fallback menu to include RD schedule path")
	}
	if scheduleR.ViewKey != "designScheduleR" {
		t.Fatalf("expected designScheduleR view key, got %q", scheduleR.ViewKey)
	}
}
