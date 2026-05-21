package services

import (
	"context"
	"errors"
	"testing"

	"github.com/AleksKAG/construction-manager/internal/models"
)

type docRepoStub struct {
	docs               []models.Document
	createVersionError error
	logChangeError     error
}

func (d *docRepoStub) Create(doc *models.Document) error {
	d.docs = append(d.docs, *doc)
	return nil
}
func (d *docRepoStub) GetByID(id string) (*models.Document, error) {
	for i := range d.docs {
		if d.docs[i].ID == id {
			return &d.docs[i], nil
		}
	}
	return nil, nil
}
func (d *docRepoStub) GetByProject(projectID string) ([]models.Document, error) { return d.docs, nil }
func (d *docRepoStub) GetByDesignation(projectID, designation string) ([]models.Document, error) {
	out := make([]models.Document, 0)
	for _, doc := range d.docs {
		if doc.ProjectID == projectID && doc.Designation == designation {
			out = append(out, doc)
		}
	}
	return out, nil
}
func (d *docRepoStub) CreateVersion(documentID string, version int, storageKey string, fileHash []byte) error {
	return d.createVersionError
}
func (d *docRepoStub) LogChange(documentID, changeType string, payload map[string]any) error {
	return d.logChangeError
}

func TestConfirmUpload_HashValidation(t *testing.T) {
	repo := &docRepoStub{}
	svc := &DocumentService{repo: repo}
	if _, err := svc.ConfirmUpload(context.Background(), "projects/p/t/d/v1/a.pdf", "abcd", 10); err == nil {
		t.Fatal("expected error for invalid hash length")
	}
}

func TestRequestPresignedURL_InputValidation(t *testing.T) {
	repo := &docRepoStub{}
	svc := &DocumentService{repo: repo}
	if _, err := svc.RequestPresignedURL(context.Background(), "", "rd", "D-1", "a.pdf", "application/pdf", 10); err == nil {
		t.Fatal("expected error for missing project id")
	}
}

func TestConfirmUpload_InvalidVersionInStorageKey(t *testing.T) {
	repo := &docRepoStub{}
	svc := &DocumentService{repo: repo}
	hash := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	if _, err := svc.ConfirmUpload(context.Background(), "projects/p/t/d/vx/a.pdf", hash, 10); err == nil {
		t.Fatal("expected error for invalid version in storage key")
	}
}

func TestConfirmUpload_PropagatesVersionWriteError(t *testing.T) {
	repo := &docRepoStub{createVersionError: errors.New("write version failed")}
	svc := &DocumentService{repo: repo}
	hash := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	if _, err := svc.ConfirmUpload(context.Background(), "projects/p/t/d/v1/a.pdf", hash, 10); err == nil {
		t.Fatal("expected error when version write fails")
	}
}
