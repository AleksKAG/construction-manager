package handlers

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type addRevisionInput struct {
	RevisionNum  string `json:"revision_num" binding:"required"`
	RevisionDate string `json:"revision_date" binding:"required"`
	ChangeNote   string `json:"change_note"`
}

type createSvorInput struct {
	DocRID                 string `json:"doc_r_id" binding:"required"`
	SubmissionDate         string `json:"submission_date"`
	ContractorFeedbackDate string `json:"contractor_feedback_date"`
	FeedbackDetails        string `json:"feedback_details"`
	Status                 string `json:"status"`
	SvorVersion            string `json:"svor_version"`
	Notes                  string `json:"notes"`
}

type patchSvorInput struct {
	SubmissionDate         *string `json:"submission_date"`
	ContractorFeedbackDate *string `json:"contractor_feedback_date"`
	FeedbackDetails        *string `json:"feedback_details"`
	Status                 *string `json:"status"`
	Notes                  *string `json:"notes"`
	RDAdjustmentVersion    *string `json:"rd_adjustment_version"`
	SyncVersion            bool    `json:"sync_version"`
	Comment                string  `json:"comment"`
	LockVersion            int     `json:"lock_version" binding:"required"`
}

func ListDocsP(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		var rows []models.DocStageP
		if err := repo.RawDB().Where("project_id = ?", projectID).Order("cipher asc").Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, rows)
	}
}

func ListDocsR(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		var rows []models.DocStageR
		if err := repo.RawDB().Where("project_id = ?", projectID).Order("cipher_r asc").Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		now := time.Now().UTC()
		result := make([]gin.H, 0, len(rows))
		for _, row := range rows {
			overdueDays := 0
			alert := "none"
			if row.CurrentRevisionDate != nil {
				overdueDays = int(now.Sub(*row.CurrentRevisionDate).Hours() / 24)
				if overdueDays > 30 {
					alert = "red"
				} else if overdueDays > 14 {
					alert = "yellow"
				}
			}
			result = append(result, gin.H{"doc": row, "overdue_days": overdueDays, "alert": alert})
		}
		c.JSON(http.StatusOK, result)
	}
}

func AddDocRRevision(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		docRID := c.Param("docId")
		var input addRevisionInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		revisionDate, err := time.Parse("2006-01-02", input.RevisionDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "revision_date must be YYYY-MM-DD"})
			return
		}

		err = repo.RawDB().Transaction(func(tx *gorm.DB) error {
			var doc models.DocStageR
			if err := tx.Where("id = ? AND project_id = ?", docRID, projectID).First(&doc).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return fmt.Errorf("doc_r not found")
				}
				return err
			}

			rev := models.DocStageRRevision{
				DocRID:       doc.ID,
				RevisionNum:  strings.TrimSpace(input.RevisionNum),
				RevisionDate: revisionDate,
				ChangeNote:   strings.TrimSpace(input.ChangeNote),
			}
			if err := tx.Create(&rev).Error; err != nil {
				return err
			}

			doc.CurrentVersion = rev.RevisionNum
			doc.CurrentRevisionDate = &rev.RevisionDate
			return tx.Save(&doc).Error
		})
		if err != nil {
			if strings.Contains(err.Error(), "not found") {
				c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"message": "revision created"})
	}
}

func ListDocRRevisions(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		docRID := c.Param("docId")

		var doc models.DocStageR
		if err := repo.RawDB().Where("id = ? AND project_id = ?", docRID, projectID).First(&doc).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"error": "doc_r not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		var rows []models.DocStageRRevision
		if err := repo.RawDB().Where("doc_r_id = ?", docRID).Order("revision_date desc").Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"doc_r": doc, "revisions": rows})
	}
}

func ListSvor(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		page := max(1, parseInt(c.Query("page"), 1))
		pageSize := min(200, max(1, parseInt(c.Query("page_size"), 20)))
		statusFilter := strings.TrimSpace(c.Query("status"))

		db := repo.RawDB().Model(&models.SvorRecord{}).Where("project_id = ?", projectID)
		if statusFilter != "" {
			db = db.Where("status = ?", statusFilter)
		}

		var total int64
		if err := db.Count(&total).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		var rows []models.SvorRecord
		if err := db.Preload("DocR").Order("updated_at desc").Limit(pageSize).Offset((page - 1) * pageSize).Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		data := make([]gin.H, 0, len(rows))
		for _, row := range rows {
			needsSync := row.DocR.CurrentVersion != "" && row.RDVersionSnapshot != "" && row.DocR.CurrentVersion != row.RDVersionSnapshot
			data = append(data, gin.H{"record": row, "rd_version_changed_after_submission": needsSync})
		}

		c.JSON(http.StatusOK, gin.H{"data": data, "pagination": gin.H{"page": page, "page_size": pageSize, "total": total}})
	}
}

func CreateSvor(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		var input createSvorInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		status := models.SvorStatusDraft
		if input.Status != "" {
			status = input.Status
		}

		var created models.SvorRecord
		err := repo.RawDB().Transaction(func(tx *gorm.DB) error {
			var docR models.DocStageR
			if err := tx.Where("id = ? AND project_id = ?", input.DocRID, projectID).First(&docR).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return fmt.Errorf("doc_r not found")
				}
				return err
			}

			record := models.SvorRecord{
				ProjectID:              projectID,
				DocRID:                 docR.ID,
				FeedbackDetails:        strings.TrimSpace(input.FeedbackDetails),
				Status:                 status,
				RDVersionSnapshot:      docR.CurrentVersion,
				RDRevisionDateSnapshot: docR.CurrentRevisionDate,
				SvorVersion:            strings.TrimSpace(input.SvorVersion),
				Notes:                  strings.TrimSpace(input.Notes),
			}
			if err := record.ValidateStatusChange(record.Status); err != nil {
				return err
			}
			if input.SubmissionDate != "" {
				d, err := time.Parse("2006-01-02", input.SubmissionDate)
				if err != nil {
					return fmt.Errorf("submission_date must be YYYY-MM-DD")
				}
				record.SubmissionDate = &d
			}
			if input.ContractorFeedbackDate != "" {
				d, err := time.Parse("2006-01-02", input.ContractorFeedbackDate)
				if err != nil {
					return fmt.Errorf("contractor_feedback_date must be YYYY-MM-DD")
				}
				record.ContractorFeedbackDate = &d
			}
			if err := tx.Create(&record).Error; err != nil {
				return err
			}
			log := models.SvorHistory{
				SvorRecordID: record.ID,
				ActionType:   models.SvorActionCreated,
				NewStatus:    record.Status,
				Comment:      "created svor record",
				UserID:       c.GetHeader("X-User-Id"),
			}
			if err := tx.Create(&log).Error; err != nil {
				return err
			}
			created = record
			return nil
		})
		if err != nil {
			if strings.Contains(err.Error(), "not found") {
				c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, created)
	}
}

func PatchSvor(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		svorID := c.Param("svorId")
		var input patchSvorInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var updated models.SvorRecord
		err := repo.RawDB().Transaction(func(tx *gorm.DB) error {
			var record models.SvorRecord
			if err := tx.Where("id = ? AND project_id = ?", svorID, projectID).First(&record).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return fmt.Errorf("svor not found")
				}
				return err
			}
			if record.LockVersion != input.LockVersion {
				return fmt.Errorf("lock_version mismatch: expected %d", record.LockVersion)
			}

			oldStatus := record.Status
			if input.SubmissionDate != nil {
				if *input.SubmissionDate == "" {
					record.SubmissionDate = nil
				} else {
					d, err := time.Parse("2006-01-02", *input.SubmissionDate)
					if err != nil {
						return fmt.Errorf("submission_date must be YYYY-MM-DD")
					}
					record.SubmissionDate = &d
				}
			}
			if input.ContractorFeedbackDate != nil {
				if *input.ContractorFeedbackDate == "" {
					record.ContractorFeedbackDate = nil
				} else {
					d, err := time.Parse("2006-01-02", *input.ContractorFeedbackDate)
					if err != nil {
						return fmt.Errorf("contractor_feedback_date must be YYYY-MM-DD")
					}
					record.ContractorFeedbackDate = &d
				}
			}
			if input.FeedbackDetails != nil {
				record.FeedbackDetails = strings.TrimSpace(*input.FeedbackDetails)
			}
			if input.Notes != nil {
				record.Notes = strings.TrimSpace(*input.Notes)
			}
			if input.RDAdjustmentVersion != nil {
				record.RDAdjustmentVersion = strings.TrimSpace(*input.RDAdjustmentVersion)
			}

			actionType := models.SvorActionStatusChanged
			if input.SyncVersion {
				var docR models.DocStageR
				if err := tx.Where("id = ? AND project_id = ?", record.DocRID, projectID).First(&docR).Error; err != nil {
					return err
				}
				record.RDVersionSnapshot = docR.CurrentVersion
				record.RDRevisionDateSnapshot = docR.CurrentRevisionDate
				actionType = models.SvorActionSnapshotSynced
			}

			if input.Status != nil {
				record.Status = strings.TrimSpace(*input.Status)
			}
			if err := record.ValidateStatusChange(record.Status); err != nil {
				return err
			}
			record.LockVersion++
			if err := tx.Save(&record).Error; err != nil {
				return err
			}

			history := models.SvorHistory{
				SvorRecordID: record.ID,
				ActionType:   actionType,
				OldStatus:    oldStatus,
				NewStatus:    record.Status,
				Comment:      strings.TrimSpace(input.Comment),
				UserID:       c.GetHeader("X-User-Id"),
			}
			if history.Comment == "" {
				history.Comment = "updated svor record"
			}
			if err := tx.Create(&history).Error; err != nil {
				return err
			}
			updated = record
			return nil
		})
		if err != nil {
			if strings.Contains(err.Error(), "not found") {
				c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
				return
			}
			if strings.Contains(err.Error(), "lock_version mismatch") {
				c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, updated)
	}
}

func GetSvorHistory(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		svorID := c.Param("svorId")
		var rows []models.SvorHistory
		if err := repo.RawDB().Where("svor_record_id = ?", svorID).Order("action_date desc").Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, rows)
	}
}

func ImportSvor(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		fileHeader, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
			return
		}
		f, err := fileHeader.Open()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		defer f.Close()

		created := 0
		skipped := 0
		errs := []string{}

		filename := strings.ToLower(fileHeader.Filename)
		if strings.HasSuffix(filename, ".xlsx") {
			rows, err := parseSimpleXLSX(f)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid xlsx file: %v", err)})
				return
			}
			for i := 1; i < len(rows); i++ {
				rowNo := i + 1
				if err := importSvorRow(repo, projectID, rowNo, rows[i], &created, &skipped, &errs); err != nil {
					errs = append(errs, err.Error())
				}
			}
			c.JSON(http.StatusOK, gin.H{"created": created, "skipped": skipped, "errors": errs, "format": "xlsx"})
			return
		}

		reader := csv.NewReader(f)
		reader.Comma = ';'
		reader.FieldsPerRecord = -1
		_, err = reader.Read()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid csv header"})
			return
		}
		rowNo := 1
		for {
			rowNo++
			row, err := reader.Read()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				errs = append(errs, fmt.Sprintf("row %d: %v", rowNo, err))
				skipped++
				continue
			}
			if err := importSvorRow(repo, projectID, rowNo, row, &created, &skipped, &errs); err != nil {
				errs = append(errs, err.Error())
			}
		}

		c.JSON(http.StatusOK, gin.H{"created": created, "skipped": skipped, "errors": errs, "format": "csv"})
	}
}

func importSvorRow(repo repository.Repository, projectID string, rowNo int, row []string, created, skipped *int, errs *[]string) error {
	if len(row) < 12 {
		*skipped = *skipped + 1
		return nil
	}
	cipherR := strings.TrimSpace(row[3])
	status := strings.TrimSpace(row[11])
	if status == "" {
		status = models.SvorStatusDraft
	}
	var docR models.DocStageR
	if err := repo.RawDB().Where("project_id = ? AND cipher_r = ?", projectID, cipherR).First(&docR).Error; err != nil {
		*errs = append(*errs, fmt.Sprintf("row %d: doc R not found for cipher %s", rowNo, cipherR))
		*skipped = *skipped + 1
		return nil
	}

	record := models.SvorRecord{
		ProjectID:              projectID,
		DocRID:                 docR.ID,
		Status:                 status,
		RDVersionSnapshot:      docR.CurrentVersion,
		RDRevisionDateSnapshot: docR.CurrentRevisionDate,
		SvorVersion:            "1",
	}
	if len(row) > 6 {
		if d, err := time.Parse("2006-01-02", strings.TrimSpace(row[6])); err == nil {
			record.SubmissionDate = &d
		}
	}
	if len(row) > 9 {
		record.RDAdjustmentVersion = strings.TrimSpace(row[9])
	}
	if len(row) > 10 {
		record.Notes = strings.TrimSpace(row[10])
	}
	if err := repo.RawDB().Create(&record).Error; err != nil {
		*errs = append(*errs, fmt.Sprintf("row %d: %v", rowNo, err))
		*skipped = *skipped + 1
		return nil
	}
	*created = *created + 1
	return nil
}

func GetSvorDashboard(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		var totalRD int64
		var totalSvor int64
		repo.RawDB().Model(&models.DocStageR{}).Where("project_id = ?", projectID).Count(&totalRD)
		repo.RawDB().Model(&models.SvorRecord{}).Where("project_id = ?", projectID).Count(&totalSvor)

		type statRow struct {
			Status string
			Count  int64
		}
		var stats []statRow
		repo.RawDB().Model(&models.SvorRecord{}).
			Select("status, count(*) as count").
			Where("project_id = ?", projectID).
			Group("status").
			Scan(&stats)

		statusMap := map[string]int64{}
		for _, s := range stats {
			statusMap[s.Status] = s.Count
		}

		percent := func(v int64) float64 {
			if totalSvor == 0 {
				return 0
			}
			return float64(v) / float64(totalSvor) * 100
		}
		c.JSON(http.StatusOK, gin.H{
			"total_rd":                 totalRD,
			"total_svor":               totalSvor,
			"approved_percent":         percent(statusMap[models.SvorStatusApproved]),
			"rework_percent":           percent(statusMap[models.SvorStatusRework]),
			"smh_remarks_percent":      percent(statusMap[models.SvorStatusSMHRemarks]),
			"status_breakdown":         statusMap,
			"generated_at":             time.Now().UTC(),
			"supports_block_filtering": true,
		})
	}
}

func ExportDocsPXLSX(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		var rows []models.DocStageP
		if err := repo.RawDB().Where("project_id = ?", projectID).Order("cipher asc").Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		tableRows := make([][]string, 0, len(rows))
		for i, r := range rows {
			tableRows = append(tableRows, []string{fmt.Sprintf("%d", i+1), r.Cipher, r.Name, r.Section})
		}
		content, err := buildSimpleXLSX([]string{"№", "Шифр", "Наименование", "Раздел/Блок"}, tableRows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		c.Header("Content-Disposition", "attachment; filename="+filepath.Base("stage_p.xlsx"))
		_, _ = c.Writer.Write(content)
	}
}

func ExportSvorReportXLSX(repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		projectID := c.Param("id")
		statusFilter := strings.TrimSpace(c.Query("status"))
		dateFrom := strings.TrimSpace(c.Query("date_from"))
		dateTo := strings.TrimSpace(c.Query("date_to"))

		db := repo.RawDB().Model(&models.SvorRecord{}).Preload("DocR").Where("project_id = ?", projectID)
		if statusFilter != "" {
			db = db.Where("status = ?", statusFilter)
		}
		if dateFrom != "" {
			db = db.Where("submission_date >= ?", dateFrom)
		}
		if dateTo != "" {
			db = db.Where("submission_date <= ?", dateTo)
		}

		var rows []models.SvorRecord
		if err := db.Order("updated_at desc").Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		tableRows := make([][]string, 0, len(rows))
		for i, r := range rows {
			issueDate := ""
			if r.DocR.IssueDate != nil {
				issueDate = r.DocR.IssueDate.Format("2006-01-02")
			}
			revDate := ""
			if r.RDRevisionDateSnapshot != nil {
				revDate = r.RDRevisionDateSnapshot.Format("2006-01-02")
			}
			submissionDate := ""
			if r.SubmissionDate != nil {
				submissionDate = r.SubmissionDate.Format("2006-01-02")
			}
			feedbackDate := ""
			if r.ContractorFeedbackDate != nil {
				feedbackDate = r.ContractorFeedbackDate.Format("2006-01-02")
			}
			tableRows = append(tableRows, []string{
				fmt.Sprintf("%d", i+1), r.DocR.CipherPRef, r.DocR.Name, r.DocR.CipherR, issueDate, r.RDVersionSnapshot,
				revDate, submissionDate, feedbackDate, r.RDAdjustmentVersion, r.Status, r.Notes,
			})
		}
		content, err := buildSimpleXLSX(
			[]string{"№", "Стадия П", "Наименование", "Стадия Р", "Дата выдачи РД", "Версия РД", "Дата ИЗМ", "СВОР направлен", "Дата замечаний СМХ", "Версия РД корректировки", "Статус", "Примечание"},
			tableRows,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		c.Header("Content-Disposition", "attachment; filename="+filepath.Base("svor_report.xlsx"))
		_, _ = c.Writer.Write(content)
	}
}
