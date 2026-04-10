package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

type agentSummaryRequest struct {
	ProjectID string `json:"project_id"`
	Question  string `json:"question"`
}

func GetAgentSummary(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input agentSummaryRequest
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}
		if strings.TrimSpace(input.ProjectID) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "project_id is required"})
			return
		}

		project, err := repo.GetProjectByID(c.Request.Context(), input.ProjectID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}

		tepRows, err := repo.ListTemplateRows(c.Request.Context(), input.ProjectID, "tep")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		estimateRows, err := repo.ListTemplateRows(c.Request.Context(), input.ProjectID, "summary_estimate")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		scheduleRows, err := repo.ListTemplateRows(c.Request.Context(), input.ProjectID, "design_schedule")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		tasks, err := repo.ListTasksByProject(c.Request.Context(), input.ProjectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		area := round2(resolveTotalArea(tepRows))
		cost, _ := resolveProjectCost(project, tepRows, estimateRows)
		plan, fact := resolvePlanFact(scheduleRows)
		cost = round2(cost)
		plan = round2(plan)
		fact = round2(fact)
		deviation := round2(fact - plan)

		actions := make([]string, 0, 3)
		if fact < 50 {
			actions = append(actions, "Провести оперативный штаб и пересчитать критический путь по графику.")
		}
		if deviation < -10 {
			actions = append(actions, "Зафиксировать отставание и выпустить корректирующий план на 2 недели.")
		}
		if cost > 0 && fact > 0 && fact < 70 {
			actions = append(actions, "Проверить прогноз EAC и подготовить лимиты на оставшиеся этапы.")
		}
		if len(actions) == 0 {
			actions = append(actions, "Продолжать мониторинг: обновлять факт и контрольные точки еженедельно.")
		}

		summary := fmt.Sprintf(
			"Проект: %s\nАдрес: %s\nПлощадь: %.2f м²\nБюджет/стоимость: %.2f руб.\nПлан: %.2f%%\nФакт: %.2f%%\nОтклонение: %.2f п.п.\nЗадач в проекте: %d",
			project.Name,
			project.Address,
			area,
			cost,
			plan,
			fact,
			deviation,
			len(tasks),
		)
		if q := strings.TrimSpace(input.Question); q != "" {
			summary = fmt.Sprintf("%s\n\nФокус вопроса: %s", summary, q)
		}

		c.JSON(http.StatusOK, gin.H{
			"project_id":    project.ID,
			"project_name":  project.Name,
			"answer":        summary,
			"next_actions":  actions,
			"question_echo": strings.TrimSpace(input.Question),
		})
	}
}
