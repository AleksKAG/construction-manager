package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
)

type agentSummaryRequest struct {
	ProjectID string `json:"project_id"`
	Question  string `json:"question"`
}

type modelsTaskView struct {
	Name    string
	EndDate string
}

func parseDateForSort(value string) time.Time {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return time.Time{}
	}
	layouts := []string{"2006-01-02", time.RFC3339, "02.01.2006"}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func isOverdue(endDate string) bool {
	d := parseDateForSort(endDate)
	if d.IsZero() {
		return false
	}
	now := time.Now().UTC()
	return d.Before(time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC))
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

		warnings := make([]string, 0, 4)
		tepRows, err := repo.ListTemplateRows(c.Request.Context(), input.ProjectID, "tep")
		if err != nil {
			warnings = append(warnings, "TEP недоступен: "+err.Error())
			tepRows = nil
		}
		estimateRows, err := repo.ListTemplateRows(c.Request.Context(), input.ProjectID, "summary_estimate")
		if err != nil {
			warnings = append(warnings, "Сводный сметный расчёт недоступен: "+err.Error())
			estimateRows = nil
		}
		scheduleRows, err := repo.ListTemplateRows(c.Request.Context(), input.ProjectID, "design_schedule")
		if err != nil {
			warnings = append(warnings, "График проектирования недоступен: "+err.Error())
			scheduleRows = nil
		}
		tasks, err := repo.ListTasksByProject(c.Request.Context(), input.ProjectID)
		if err != nil {
			warnings = append(warnings, "Задачи проекта недоступны: "+err.Error())
			tasks = nil
		}

		area := round2(resolveTotalArea(tepRows))
		cost, _ := resolveProjectCost(project, tepRows, estimateRows)
		plan, fact := resolvePlanFact(scheduleRows)
		cost = round2(cost)
		plan = round2(plan)
		fact = round2(fact)
		deviation := round2(fact - plan)

		activeStatusMap := map[string]string{
			"active":       "активный",
			"design":       "активный",
			"construction": "активный",
			"planning":     "черновик",
			"on_hold":      "на паузе",
			"complete":     "завершён",
			"completed":    "завершён",
		}
		projectStatus := activeStatusMap[strings.TrimSpace(strings.ToLower(project.Status))]
		if projectStatus == "" {
			projectStatus = strings.TrimSpace(project.Status)
			if projectStatus == "" {
				projectStatus = "не указан"
			}
		}

		completedTasks := make([]modelsTaskView, 0, len(tasks))
		criticalMoments := make([]string, 0, 3)
		for _, task := range tasks {
			status := strings.ToLower(strings.TrimSpace(task.Status))
			progressVal := task.Progress
			if progressVal > 1 {
				progressVal = progressVal / 100
			}
			if status == "done" || status == "completed" || status == "завершено" || status == "выполнено" || progressVal >= 0.99 {
				completedTasks = append(completedTasks, modelsTaskView{Name: task.Name, EndDate: strings.TrimSpace(task.EndDate)})
				continue
			}
			if strings.TrimSpace(task.EndDate) != "" && isOverdue(task.EndDate) {
				criticalMoments = append(criticalMoments, fmt.Sprintf("Просрочка: %s (срок %s)", task.Name, task.EndDate))
			}
		}
		sort.Slice(completedTasks, func(i, j int) bool {
			return parseDateForSort(completedTasks[i].EndDate).After(parseDateForSort(completedTasks[j].EndDate))
		})
		lastDone := make([]string, 0, 3)
		for i := 0; i < len(completedTasks) && i < 3; i += 1 {
			item := completedTasks[i]
			if item.EndDate != "" {
				lastDone = append(lastDone, fmt.Sprintf("%s (%s)", item.Name, item.EndDate))
			} else {
				lastDone = append(lastDone, item.Name)
			}
		}
		if len(lastDone) == 0 {
			lastDone = append(lastDone, "нет завершённых задач")
		}
		if deviation < -10 {
			criticalMoments = append(criticalMoments, fmt.Sprintf("Отставание от плана: %.2f п.п.", -deviation))
		}
		if fact < 40 {
			criticalMoments = append(criticalMoments, "Низкий факт выполнения (<40%).")
		}
		if len(criticalMoments) == 0 {
			criticalMoments = append(criticalMoments, "Критических отклонений не выявлено.")
		}

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
			"Проект: %s\n\n1) Статус и контекст:\n- Статус: %s\n- Адрес: %s\n\n2) Прогресс:\n- Площадь: %.2f м²\n- Бюджет/стоимость: %.2f руб.\n- План: %.2f%%\n- Факт: %.2f%%\n- Отклонение: %.2f п.п.\n\n3) Последние задачи:\n- Всего задач: %d\n- Выполнено недавно: %s\n\n4) Критические риски:\n- %s",
			project.Name,
			projectStatus,
			project.Address,
			area,
			cost,
			plan,
			fact,
			deviation,
			len(tasks),
			strings.Join(lastDone, "; "),
			strings.Join(criticalMoments, "; "),
		)
		if q := strings.TrimSpace(input.Question); q != "" {
			summary = fmt.Sprintf("%s\n\nФокус вопроса: %s", summary, q)
		}
		if len(warnings) > 0 {
			summary = fmt.Sprintf("%s\n\n5) Ограничения данных (fallback при частичных ошибках API):\n- %s", summary, strings.Join(warnings, "\n- "))
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
