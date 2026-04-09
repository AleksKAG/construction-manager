package handlers

import (
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

type tepSection struct {
	Code  string                      `json:"code"`
	Title string                      `json:"title"`
	Rows  []models.ProjectTemplateRow `json:"rows"`
}

var tepSectionTitles = map[string]string{
	"section_1": "Раздел 1. Характеристика земельного участка",
	"section_2": "Раздел 2. Характеристики зданий, строений, сооружений",
	"section_3": "Раздел 3. Инженерные нагрузки и ресурсы",
	"section_4": "Раздел 4. Стоимостные показатели",
}

var tepKeyToSection = map[string]string{
	"land_area_total":      "section_1",
	"land_area_design":     "section_1",
	"footprint_area":       "section_1",
	"landscaping_area":     "section_1",
	"paving_area":          "section_1",
	"building_volume":      "section_2",
	"total_area":           "section_2",
	"clear_height":         "section_2",
	"floors_count":         "section_2",
	"cold_water_m3d":       "section_3",
	"hot_water_m3d":        "section_3",
	"wastewater_m3d":       "section_3",
	"heat_total_kw":        "section_3",
	"heat_hvac_kw":         "section_3",
	"heat_hw_kw":           "section_3",
	"installed_power_kw":   "section_3",
	"calc_power_kw":        "section_3",
	"cost_construction":    "section_4",
	"cost_design_survey":   "section_4",
	"cost_cmr":             "section_4",
	"cost_other":           "section_4",
	"construction_cost":    "section_4",
	"total_estimated_cost": "section_4",
}

var tepIndicatorToKey = map[string]string{
	"общая площадь земельного участка":               "land_area_total",
	"площадь участка в границах проектирования":      "land_area_design",
	"площадь застройки":                              "footprint_area",
	"площадь озеленения":                             "landscaping_area",
	"площадь покрытий":                               "paving_area",
	"строительный объем":                             "building_volume",
	"общая площадь здания":                           "total_area",
	"высота этажа (в чистоте)":                       "clear_height",
	"количество этажей":                              "floors_count",
	"холодное водоснабжение":                         "cold_water_m3d",
	"горячее водоснабжение":                          "hot_water_m3d",
	"водоотведение хозяйственно-бытовых сточных вод": "wastewater_m3d",
	"расход тепла":                                   "heat_total_kw",
	"в т.ч. - отопление, вентиляцию":                 "heat_hvac_kw",
	"гвс": "heat_hw_kw",
	"установленная мощность":         "installed_power_kw",
	"расчетная мощность":             "calc_power_kw",
	"стоимость строительства":        "cost_construction",
	"проектно-изыскательские работы": "cost_design_survey",
	"стоимость смр":                  "cost_cmr",
	"прочие затраты":                 "cost_other",
}

func GetTEPByProject(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("projectId")
		project, err := repo.GetProjectByID(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		rows, err := repo.ListTemplateRows(c.Request.Context(), projectID, "tep")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		sections := map[string][]models.ProjectTemplateRow{
			"section_1": {}, "section_2": {}, "section_3": {}, "section_4": {},
		}
		for _, row := range rows {
			section := resolveSection(row)
			sections[section] = append(sections[section], row)
		}

		out := make([]tepSection, 0, 4)
		for _, code := range []string{"section_1", "section_2", "section_3", "section_4"} {
			out = append(out, tepSection{Code: code, Title: tepSectionTitles[code], Rows: sections[code]})
		}

		c.JSON(http.StatusOK, gin.H{
			"project_id":   projectID,
			"project_name": project.Name,
			"sections":     out,
		})
	}
}

func PatchTEPRow(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var input struct {
			Data      map[string]string `json:"data"`
			SortOrder *int              `json:"sort_order"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		row, err := repo.GetTemplateRowByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "row not found"})
			return
		}
		if row.TemplateCode != "tep" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "row is not TEP"})
			return
		}
		if input.Data != nil {
			unit := strings.TrimSpace(input.Data["unit"])
			if unit != "" && !isAllowedTEPUnit(unit) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported unit"})
				return
			}
			row.ValuesMap = input.Data
		}
		if input.SortOrder != nil && *input.SortOrder > 0 {
			row.RowNumber = *input.SortOrder
		}
		if err := repo.UpdateTemplateRow(c.Request.Context(), row); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, row)
	}
}

func GetEstimateSummary(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("projectId")
		rows, err := repo.ListTemplateRows(c.Request.Context(), projectID, "summary_estimate")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		total, approvedCount := resolveApprovedEstimateTotal(rows)
		c.JSON(http.StatusOK, gin.H{
			"project_id":           projectID,
			"approved_rows":        approvedCount,
			"total_estimated_cost": round2(total),
			"currency":             "RUB",
		})
	}
}

func GetDashboardMetrics(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("projectId")
		project, err := repo.GetProjectByID(c.Request.Context(), projectID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		tepRows, err := repo.ListTemplateRows(c.Request.Context(), projectID, "tep")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		estimateRows, err := repo.ListTemplateRows(c.Request.Context(), projectID, "summary_estimate")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		scheduleRows, err := repo.ListTemplateRows(c.Request.Context(), projectID, "design_schedule")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		area := resolveTotalArea(tepRows)
		cost, costSource := resolveProjectCost(project, tepRows, estimateRows)
		plan, fact := resolvePlanFact(scheduleRows)

		c.JSON(http.StatusOK, gin.H{
			"project_id": projectID,
			"area":       gin.H{"total_area_m2": round2(area), "source": "tep"},
			"cost":       gin.H{"value": round2(cost), "source": costSource},
			"progress":   gin.H{"plan_percent": round2(plan), "fact_percent": round2(fact), "source": "design_schedule"},
		})
	}
}

func resolveProjectCost(project *models.ProjectObject, tepRows, estimateRows []models.ProjectTemplateRow) (float64, string) {
	approvedTotal, approvedCount := resolveApprovedEstimateTotal(estimateRows)
	if approvedCount > 0 && approvedTotal > 0 {
		return approvedTotal, "approved_estimates"
	}
	if tepCost := resolveConstructionCostFromTEP(tepRows); tepCost > 0 {
		return tepCost, "tep.construction_cost"
	}
	return project.Budget, "project.budget"
}

func resolveApprovedEstimateTotal(rows []models.ProjectTemplateRow) (float64, int) {
	total := 0.0
	count := 0
	for _, row := range rows {
		if !isApprovedRow(row) {
			continue
		}
		cost := pickNumber(row.ValuesMap, "total_estimated_cost", "total_cost", "cost", "amount")
		if cost <= 0 {
			continue
		}
		total += cost
		count++
	}
	if count > 0 {
		return total, count
	}
	for _, row := range rows {
		cost := pickNumber(row.ValuesMap, "total_estimated_cost", "total_cost", "cost", "amount")
		if cost <= 0 {
			continue
		}
		total += cost
		count++
	}
	return total, count
}

func isApprovedRow(row models.ProjectTemplateRow) bool {
	v := strings.ToLower(strings.TrimSpace(firstNonEmpty(row.ValuesMap["approved"], row.ValuesMap["is_approved"], row.ValuesMap["status"])))
	return v == "true" || v == "1" || v == "да" || v == "approved" || v == "утверждена" || v == "утверждено"
}

func resolveTotalArea(rows []models.ProjectTemplateRow) float64 {
	for _, row := range rows {
		if v := pickNumber(row.ValuesMap, "total_area", "total_area_m2"); v > 0 {
			return v
		}
		if normalize(row.ValuesMap["indicator"]) == "общая площадь здания" {
			if v := pickNumber(row.ValuesMap, "amount", "value"); v > 0 {
				return v
			}
		}
	}
	return 0
}

func resolveConstructionCostFromTEP(rows []models.ProjectTemplateRow) float64 {
	for _, row := range rows {
		if v := pickNumber(row.ValuesMap, "construction_cost", "cost_construction"); v > 0 {
			return v
		}
		if strings.Contains(normalize(row.ValuesMap["indicator"]), "стоимость строительства") {
			if v := pickNumber(row.ValuesMap, "amount", "value"); v > 0 {
				return v
			}
		}
	}
	return 0
}

func resolvePlanFact(rows []models.ProjectTemplateRow) (float64, float64) {
	planned := 0.0
	actual := 0.0
	progressSum := 0.0
	progressCount := 0.0
	for _, row := range rows {
		planned += pickNumber(row.ValuesMap, "planned_duration", "baseline_days")
		actual += pickNumber(row.ValuesMap, "actual_duration", "fact_days")
		if p := pickNumber(row.ValuesMap, "progress", "fact_percent"); p > 0 {
			progressSum += p
			progressCount++
		}
	}
	if planned > 0 {
		fact := math.Min(100, (actual/planned)*100)
		return 100, fact
	}
	if progressCount > 0 {
		avg := progressSum / progressCount
		return 100, math.Min(100, avg)
	}
	return 0, 0
}

func resolveSection(row models.ProjectTemplateRow) string {
	if key := strings.TrimSpace(row.ValuesMap["key"]); key != "" {
		if section, ok := tepKeyToSection[key]; ok {
			return section
		}
	}
	indicator := normalize(row.ValuesMap["indicator"])
	if key, ok := tepIndicatorToKey[indicator]; ok {
		if section, found := tepKeyToSection[key]; found {
			return section
		}
	}
	n := parseIntFromAny(row.ValuesMap["num"], row.RowNumber)
	switch {
	case n >= 1 && n <= 5:
		return "section_1"
	case n >= 6 && n <= 9:
		return "section_2"
	case n >= 10 && n <= 17:
		return "section_3"
	default:
		return "section_4"
	}
}

func isAllowedTEPUnit(unit string) bool {
	allowed := map[string]struct{}{"м2": {}, "м3": {}, "м": {}, "м3/сут": {}, "кВт": {}, "руб": {}, "руб.": {}, "тыс. руб.": {}, "": {}}
	_, ok := allowed[unit]
	return ok
}

func pickNumber(data map[string]string, keys ...string) float64 {
	for _, key := range keys {
		if v, err := parseFlexibleFloat(data[key]); err == nil {
			return v
		}
	}
	return 0
}

func parseFlexibleFloat(raw string) (float64, error) {
	v := strings.TrimSpace(raw)
	v = strings.ReplaceAll(v, " ", "")
	v = strings.ReplaceAll(v, ",", ".")
	if v == "" {
		return 0, strconv.ErrSyntax
	}
	return strconv.ParseFloat(v, 64)
}

func parseIntFromAny(raw string, fallback int) int {
	if strings.TrimSpace(raw) == "" {
		return fallback
	}
	if v, err := strconv.Atoi(raw); err == nil {
		return v
	}
	return fallback
}

func normalize(v string) string {
	return strings.ToLower(strings.TrimSpace(v))
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func sortRows(rows []models.ProjectTemplateRow) {
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].RowNumber < rows[j].RowNumber })
}
