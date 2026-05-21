package services

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/AleksKAG/construction-manager/internal/integration/s3"
	"github.com/AleksKAG/construction-manager/internal/models"
	"github.com/AleksKAG/construction-manager/internal/repository"
	"github.com/google/uuid"
)

type DocumentService struct {
	s3Client *s3.Client
	repo     repository.DocumentRepository
}

func NewDocumentService(s3Client *s3.Client, repo repository.DocumentRepository) *DocumentService {
	return &DocumentService{s3Client: s3Client, repo: repo}
}
func (s *DocumentService) RequestPresignedURL(ctx context.Context, projectID, docType, designation, filename, contentType string, size int64) (map[string]any, error) {
	if strings.TrimSpace(projectID) == "" || strings.TrimSpace(docType) == "" || strings.TrimSpace(designation) == "" || strings.TrimSpace(filename) == "" {
		return nil, errors.New("project_id, doc_type, designation and filename are required")
	}
	if size <= 0 {
		return nil, errors.New("size must be greater than zero")
	}
	filename = filepath.Base(strings.TrimSpace(filename))
	newVersion := 1
	if ex, _ := s.repo.GetByDesignation(projectID, designation); len(ex) > 0 {
		newVersion = ex[0].Version + 1
	}
	storageKey := fmt.Sprintf("projects/%s/%s/%s/v%d/%s", projectID, docType, designation, newVersion, filename)
	ttl, _ := time.ParseDuration(os.Getenv("S3_PREP_URL_TTL"))
	if ttl == 0 {
		ttl = time.Hour
	}
	url, err := s.s3Client.GetPresignedPUTURL(ctx, storageKey, contentType, ttl)
	if err != nil {
		return nil, err
	}
	return map[string]any{"presigned_url": url, "storage_key": storageKey, "version": newVersion, "size_limit": size}, nil
}
func (s *DocumentService) ConfirmUpload(ctx context.Context, storageKey, fileHashHex string, size int64) (*models.Document, error) {
	if size <= 0 {
		return nil, errors.New("size must be greater than zero")
	}
	h, err := hex.DecodeString(fileHashHex)
	if err != nil {
		return nil, err
	}
	if len(h) != sha256HexBytesLen {
		return nil, fmt.Errorf("invalid file_hash size: expected %d bytes", sha256HexBytesLen)
	}
	p := strings.Split(storageKey, "/")
	if len(p) < 6 {
		return nil, fmt.Errorf("invalid storage_key format")
	}
	ver, _ := strconv.Atoi(strings.TrimPrefix(p[4], "v"))
	if ver <= 0 {
		return nil, errors.New("invalid storage_key version")
	}
	doc := &models.Document{ID: uuid.NewString(), ProjectID: p[1], DocType: p[2], Designation: p[3], Version: ver, Name: p[5], StorageKey: storageKey, FileHash: h, SizeBytes: size, Status: models.StatusDraft}
	if err := s.repo.Create(doc); err != nil {
		return nil, err
	}
	if err := s.repo.CreateVersion(doc.ID, doc.Version, doc.StorageKey, doc.FileHash); err != nil {
		return nil, err
	}
	if err := s.repo.LogChange(doc.ID, "uploaded", map[string]any{
		"storage_key": doc.StorageKey,
		"size_bytes":  doc.SizeBytes,
		"status":      doc.Status,
	}); err != nil {
		return nil, err
	}
	return doc, nil
}

const sha256HexBytesLen = 32

func (s *DocumentService) GetDownloadURL(ctx context.Context, docID string) (string, error) {
	doc, err := s.repo.GetByID(docID)
	if err != nil {
		return "", err
	}
	ttl, _ := time.ParseDuration(os.Getenv("S3_GET_URL_TTL"))
	if ttl == 0 {
		ttl = 24 * time.Hour
	}
	return s.s3Client.GetPresignedGETURL(ctx, doc.StorageKey, ttl)
}
func (s *DocumentService) CompareVersions(ctx context.Context, projectID, designation string) ([]models.Document, error) {
	return s.repo.GetByDesignation(projectID, designation)
}

func FileHashHex(hash []byte) string {
	return hex.EncodeToString(hash)
}
