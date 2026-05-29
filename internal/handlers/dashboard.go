package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func GetDashboardProgress(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		if projectID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "project id is required"})
			return
		}

		design, smr, err := repo.GetProjectProgress(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"design": design, "smr": smr})
	}
}

func GetUpcomingTasks(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 10
		if raw := c.DefaultQuery("limit", "10"); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
				limit = parsed
			}
		}

		tasks, err := repo.GetUpcomingTasks(c.Request.Context(), limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, tasks)
	}
}

func GetProjectDashboard(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		if projectID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "project id is required"})
			return
		}
		role := strings.TrimSpace(c.Query("role"))
		if role == "" {
			if raw, ok := c.Get("role"); ok {
				role, _ = raw.(string)
			}
		}
		if role == "" {
			role = "viewer"
		}

		project, err := repo.GetProjectByID(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}

		tepRows, tepErr := repo.ListTemplateRows(c.Request.Context(), projectID, "tep")
		estimateRows, estimateErr := repo.ListTemplateRows(c.Request.Context(), projectID, "summary_estimate")
		scheduleRows, scheduleErr := repo.ListTemplateRows(c.Request.Context(), projectID, "design_schedule")
		var tasks []models.GanttTask
		if taskErr := repo.RawDB().WithContext(c.Request.Context()).Where("object_id = ?", projectID).Find(&tasks).Error; taskErr != nil {
			tasks = nil
		}
		var registries []models.DocumentRegistry
		_ = repo.RawDB().WithContext(c.Request.Context()).Where("project_id = ?", projectID).Find(&registries).Error

		area := 0.0
		if tepErr == nil {
			area = resolveTotalArea(tepRows)
		}
		approvedBudget, approvedRows := 0.0, 0
		if estimateErr == nil {
			approvedBudget, approvedRows = resolveApprovedEstimateTotal(estimateRows)
		}
		if approvedBudget == 0 {
			approvedBudget = project.BudgetTotal
		}
		plan, fact := 0.0, 0.0
		if scheduleErr == nil {
			plan, fact = resolvePlanFact(scheduleRows)
		}
		if len(tasks) > 0 {
			fact = averageTaskProgress(tasks)
			if plan == 0 {
				plan = 100
			}
		}

		widgets := []gin.H{
			{"code": "tep", "title": "📊 ТЭП", "status": availabilityStatus(tepErr), "filters": []string{"stage"}, "data": gin.H{"total_area_m2": round2(area), "sections": len(tepRows)}},
			{"code": "budget_evm", "title": "💰 Бюджет (EVM)", "status": availabilityStatus(estimateErr), "filters": []string{"baseline", "current"}, "data": gin.H{"bac": round2(project.BudgetTotal), "eac": round2(approvedBudget), "approved_rows": approvedRows, "currency": "RUB"}},
			{"code": "construction_progress", "title": "📈 Строительная готовность", "status": availabilityStatus(scheduleErr), "filters": []string{"согл", "текущий", "согл+текущий"}, "data": gin.H{"plan_percent": round2(plan), "fact_percent": round2(fact)}},
			{"code": "risks_delays", "title": "⚠️ Риски и отставания", "status": "ok", "filters": []string{"type", "priority"}, "data": gin.H{"active_risks": countDelayedTasks(tasks), "max_deviation_days": maxDelayDays(tasks)}},
			{"code": "protocols", "title": "📝 Протоколы в работе", "status": "ok", "filters": []string{"due_date"}, "data": gin.H{"pending": countRegistryPending(registries), "overdue": countDelayedTasks(tasks)}},
		}

		c.Header("Cache-Control", "private, max-age=900")
		c.JSON(http.StatusOK, gin.H{
			"project_id":           projectID,
			"role":                 role,
			"readonly":             role == "viewer",
			"snapshot_ttl_seconds": 900,
			"generated_at":         time.Now().UTC(),
			"project":              gin.H{"name": project.Name, "status": project.Status, "address": project.Address, "region_code": project.RegionCode},
			"widgets":              filterDashboardWidgetsForRole(widgets, role),
		})
	}
}

func GetDashboardLayout(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		if projectID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "project id is required"})
			return
		}
		role := contextRole(c)
		userID := contextUserID(c)
		if !repo.RawDB().Migrator().HasTable("user_dashboard_layouts") {
			c.JSON(http.StatusOK, gin.H{"project_id": projectID, "role": role, "layout": []gin.H{}, "filters": gin.H{}})
			return
		}

		var row struct {
			Layout  string `gorm:"column:layout"`
			Filters string `gorm:"column:filters"`
		}
		err := repo.RawDB().WithContext(c.Request.Context()).
			Table("user_dashboard_layouts").
			Select("layout::text AS layout, filters::text AS filters").
			Where("project_id = ? AND user_id = ? AND role_code = ?", projectID, userID, role).
			Take(&row).Error
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"project_id": projectID, "role": role, "layout": []gin.H{}, "filters": gin.H{}})
			return
		}

		var layout []map[string]any
		var filters map[string]any
		_ = json.Unmarshal([]byte(row.Layout), &layout)
		_ = json.Unmarshal([]byte(row.Filters), &filters)
		if layout == nil {
			layout = []map[string]any{}
		}
		if filters == nil {
			filters = map[string]any{}
		}
		c.JSON(http.StatusOK, gin.H{"project_id": projectID, "role": role, "layout": layout, "filters": filters})
	}
}

func PutDashboardLayout(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		if projectID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "project id is required"})
			return
		}
		var input struct {
			Layout  []map[string]any `json:"layout"`
			Filters map[string]any   `json:"filters"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if input.Layout == nil {
			input.Layout = []map[string]any{}
		}
		if input.Filters == nil {
			input.Filters = map[string]any{}
		}
		if !repo.RawDB().Migrator().HasTable("user_dashboard_layouts") {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "dashboard layout table is not migrated"})
			return
		}
		layoutJSON, _ := json.Marshal(input.Layout)
		filtersJSON, _ := json.Marshal(input.Filters)
		role := contextRole(c)
		userID := contextUserID(c)
		err := repo.RawDB().WithContext(c.Request.Context()).Exec(`
INSERT INTO user_dashboard_layouts (id, project_id, user_id, role_code, layout, filters, created_at, updated_at)
VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, NOW(), NOW())
ON CONFLICT (project_id, user_id, role_code)
DO UPDATE SET layout = EXCLUDED.layout, filters = EXCLUDED.filters, updated_at = NOW()`,
			uuid.NewString(), projectID, userID, role, string(layoutJSON), string(filtersJSON),
		).Error
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"project_id": projectID, "role": role, "layout": input.Layout, "filters": input.Filters})
	}
}

func contextRole(c *gin.Context) string {
	if raw, ok := c.Get("role"); ok {
		if role, ok := raw.(string); ok && strings.TrimSpace(role) != "" {
			return strings.TrimSpace(role)
		}
	}
	return "viewer"
}

func contextUserID(c *gin.Context) string {
	if raw, ok := c.Get("user_id"); ok {
		if userID, ok := raw.(string); ok && strings.TrimSpace(userID) != "" {
			return strings.TrimSpace(userID)
		}
	}
	return "anonymous"
}

func averageTaskProgress(tasks []models.GanttTask) float64 {
	if len(tasks) == 0 {
		return 0
	}
	total := 0.0
	for _, t := range tasks {
		total += t.Progress
	}
	return total / float64(len(tasks))
}
func countDelayedTasks(tasks []models.GanttTask) int {
	c := 0
	for _, t := range tasks {
		if strings.Contains(strings.ToLower(t.Status), "overdue") || strings.Contains(strings.ToLower(t.Status), "проср") {
			c++
		}
	}
	return c
}
func maxDelayDays(tasks []models.GanttTask) int {
	max := 0
	today := time.Now().UTC()
	for _, t := range tasks {
		if t.EndDate == "" {
			continue
		}
		end, err := time.Parse("2006-01-02", t.EndDate)
		if err != nil {
			continue
		}
		if t.Progress < 100 && end.Before(today) {
			days := int(today.Sub(end).Hours() / 24)
			if days > max {
				max = days
			}
		}
	}
	return max
}
func countRegistryPending(rows []models.DocumentRegistry) int {
	c := 0
	for _, r := range rows {
		s := strings.ToLower(r.SyncedStatus)
		if s == "" || s == "pending" || strings.Contains(s, "work") {
			c++
		}
	}
	return c
}
func availabilityStatus(err error) string {
	if err != nil {
		return "⚠️ Данные временно недоступны"
	}
	return "ok"
}
func filterDashboardWidgetsForRole(widgets []gin.H, role string) []gin.H {
	if role == "viewer" {
		for _, w := range widgets {
			w["readonly"] = true
		}
	}
	if role == "designer" || role == "gip" {
		return pickWidgets(widgets, "tep", "construction_progress", "protocols", "risks_delays")
	}
	if role == "estimator" {
		return pickWidgets(widgets, "budget_evm", "construction_progress")
	}
	if role == "contractor" {
		return pickWidgets(widgets, "construction_progress", "protocols", "risks_delays")
	}
	return widgets
}
func pickWidgets(widgets []gin.H, codes ...string) []gin.H {
	allowed := map[string]bool{}
	for _, c := range codes {
		allowed[c] = true
	}
	out := []gin.H{}
	for _, w := range widgets {
		if code, _ := w["code"].(string); allowed[code] {
			out = append(out, w)
		}
	}
	return out
}

func ExportDashboardReport(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			ProjectID string `json:"project_id" binding:"required"`
			Role      string `json:"role"`
			Format    string `json:"format"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		input.Format = strings.ToLower(strings.TrimSpace(input.Format))
		if input.Format == "" {
			input.Format = "xlsx"
		}
		role := strings.TrimSpace(input.Role)
		if role == "" {
			role = contextRole(c)
		}

		project, err := repo.GetProjectByID(c.Request.Context(), input.ProjectID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		rows := dashboardExportRows(c, repo, project, role)
		safeName := strings.NewReplacer(" ", "_", "/", "_", "\\", "_", "\"", "").Replace(project.Name)
		if safeName == "" {
			safeName = "dashboard"
		}

		switch input.Format {
		case "xlsx", "excel":
			data, err := buildSimpleXLSX([]string{"Показатель", "Значение"}, rows)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
			c.Header("Content-Disposition", "attachment; filename=dashboard_"+safeName+".xlsx")
			c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data)
		case "pdf":
			lines := []string{"Construction Manager dashboard", "Project: " + project.Name, "Generated: " + time.Now().UTC().Format(time.RFC3339)}
			for _, row := range rows {
				if len(row) >= 2 {
					lines = append(lines, row[0]+": "+row[1])
				}
			}
			data := buildSimplePDF(lines)
			c.Header("Content-Type", "application/pdf")
			c.Header("Content-Disposition", "attachment; filename=dashboard_"+safeName+".pdf")
			c.Data(http.StatusOK, "application/pdf", data)
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "format must be xlsx or pdf"})
		}
	}
}

func dashboardExportRows(c *gin.Context, repo repository.Repository, project *models.Project, role string) [][]string {
	tepRows, _ := repo.ListTemplateRows(c.Request.Context(), project.ID, "tep")
	estimateRows, _ := repo.ListTemplateRows(c.Request.Context(), project.ID, "summary_estimate")
	scheduleRows, _ := repo.ListTemplateRows(c.Request.Context(), project.ID, "design_schedule")
	var tasks []models.GanttTask
	_ = repo.RawDB().WithContext(c.Request.Context()).Where("object_id = ?", project.ID).Find(&tasks).Error
	area := resolveTotalArea(tepRows)
	approvedBudget, approvedRows := resolveApprovedEstimateTotal(estimateRows)
	if approvedBudget == 0 {
		approvedBudget = project.BudgetTotal
	}
	plan, fact := resolvePlanFact(scheduleRows)
	if len(tasks) > 0 {
		fact = averageTaskProgress(tasks)
		if plan == 0 {
			plan = 100
		}
	}
	return [][]string{
		{"Project ID", project.ID},
		{"Project", project.Name},
		{"Role", role},
		{"Status", project.Status},
		{"Address", firstNonEmpty(project.Address, project.Location)},
		{"Region", project.RegionCode},
		{"Total area, m2", strconv.FormatFloat(round2(area), 'f', 2, 64)},
		{"BAC, RUB", strconv.FormatFloat(round2(project.BudgetTotal), 'f', 2, 64)},
		{"EAC, RUB", strconv.FormatFloat(round2(approvedBudget), 'f', 2, 64)},
		{"Approved estimate rows", strconv.Itoa(approvedRows)},
		{"Plan progress, %", strconv.FormatFloat(round2(plan), 'f', 2, 64)},
		{"Fact progress, %", strconv.FormatFloat(round2(fact), 'f', 2, 64)},
		{"Delayed tasks", strconv.Itoa(countDelayedTasks(tasks))},
		{"Max delay, days", strconv.Itoa(maxDelayDays(tasks))},
	}
}
