//go:build ignore

// One-shot backfill utility for pgvector RAG chunks.
//
// Usage example:
//   DATABASE_URL='postgres://user:pass@localhost:5432/cm?sslmode=disable' \
//   YANDEX_AI_API_KEY='***' \
//   go run scripts/embed_existing_data.go
package main

import (
	"context"
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

const (
	chunkWords   = 500
	chunkOverlap = 80
	embeddingDim = 1024
	batchSize    = 100
)

type sourceDoc struct {
	ProjectID  string
	SourceTable string
	SourceID   string
	Title      string
	Content    string
}

type docChunk struct {
	ProjectID   string
	SourceTable string
	SourceID    string
	Title       string
	ChunkIndex  int
	Content     string
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	docs, err := loadDocuments(ctx, db)
	if err != nil {
		log.Fatalf("load docs: %v", err)
	}
	log.Printf("loaded %d docs", len(docs))

	var chunks []docChunk
	for _, d := range docs {
		chunks = append(chunks, splitDoc(d)...)
	}
	log.Printf("prepared %d chunks", len(chunks))

	if err := upsertChunks(ctx, db, chunks); err != nil {
		log.Fatalf("upsert chunks: %v", err)
	}

	log.Printf("done")
}

func loadDocuments(ctx context.Context, db *sql.DB) ([]sourceDoc, error) {
	// NOTE: tune SQL under your current schema. This query is intentionally
	// permissive and targets typical columns used in project docs.
	queries := map[string]string{
		"ird":       `SELECT project_id::text, id::text, COALESCE(code, name, 'ИРД'), COALESCE(content, description, '') FROM ird`,
		"stage_p":   `SELECT project_id::text, id::text, COALESCE(code, name, 'Стадия П'), COALESCE(content, description, '') FROM stage_p`,
		"stage_r":   `SELECT project_id::text, id::text, COALESCE(code, name, 'Стадия Р'), COALESCE(content, description, '') FROM stage_r`,
		"estimates": `SELECT project_id::text, id::text, COALESCE(code, name, 'Смета'), COALESCE(content, description, '') FROM estimates`,
		"protocols": `SELECT project_id::text, id::text, COALESCE(code, name, 'Протокол'), COALESCE(content, description, '') FROM protocols`,
	}

	var all []sourceDoc
	for table, q := range queries {
		rows, err := db.QueryContext(ctx, q)
		if err != nil {
			log.Printf("skip table %s: %v", table, err)
			continue
		}
		for rows.Next() {
			var d sourceDoc
			if err := rows.Scan(&d.ProjectID, &d.SourceID, &d.Title, &d.Content); err != nil {
				rows.Close()
				return nil, err
			}
			d.SourceTable = table
			d.Content = normalizeText(fmt.Sprintf("%s\n\n%s", d.Title, d.Content))
			if d.Content != "" {
				all = append(all, d)
			}
		}
		rows.Close()
	}

	sort.Slice(all, func(i, j int) bool {
		if all[i].ProjectID == all[j].ProjectID {
			if all[i].SourceTable == all[j].SourceTable {
				return all[i].SourceID < all[j].SourceID
			}
			return all[i].SourceTable < all[j].SourceTable
		}
		return all[i].ProjectID < all[j].ProjectID
	})

	return all, nil
}

func splitDoc(d sourceDoc) []docChunk {
	words := strings.Fields(d.Content)
	if len(words) == 0 {
		return nil
	}
	step := chunkWords - chunkOverlap
	if step <= 0 {
		step = chunkWords
	}

	var out []docChunk
	chunkIdx := 0
	for start := 0; start < len(words); start += step {
		end := start + chunkWords
		if end > len(words) {
			end = len(words)
		}
		text := strings.Join(words[start:end], " ")
		out = append(out, docChunk{
			ProjectID:   d.ProjectID,
			SourceTable: d.SourceTable,
			SourceID:    d.SourceID,
			Title:       d.Title,
			ChunkIndex:  chunkIdx,
			Content:     text,
		})
		chunkIdx++
		if end == len(words) {
			break
		}
	}
	return out
}

func upsertChunks(ctx context.Context, db *sql.DB, chunks []docChunk) error {
	for i := 0; i < len(chunks); i += batchSize {
		end := i + batchSize
		if end > len(chunks) {
			end = len(chunks)
		}

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}

		for _, ch := range chunks[i:end] {
			emb, err := getEmbedding(ctx, ch.Content)
			if err != nil {
				_ = tx.Rollback()
				return fmt.Errorf("embedding failed for %s/%s chunk %d: %w", ch.SourceTable, ch.SourceID, ch.ChunkIndex, err)
			}
			if len(emb) != embeddingDim {
				_ = tx.Rollback()
				return fmt.Errorf("invalid embedding dimension %d for %s/%s", len(emb), ch.SourceTable, ch.SourceID)
			}

			_, err = tx.ExecContext(ctx, `
				INSERT INTO ai_document_chunks (
					project_id, source_table, source_id, source_title,
					chunk_index, content, embedding, token_count, metadata
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
				ON CONFLICT DO NOTHING
			`, ch.ProjectID, ch.SourceTable, ch.SourceID, ch.Title, ch.ChunkIndex, ch.Content, vectorLiteral(emb), estimateTokenCount(ch.Content), chunkMetaJSON(ch.Content))
			if err != nil {
				_ = tx.Rollback()
				return err
			}
		}

		if err := tx.Commit(); err != nil {
			return err
		}
		log.Printf("upserted chunks %d..%d", i, end-1)
	}
	return nil
}

func getEmbedding(_ context.Context, text string) ([]float32, error) {
	// TODO: replace with Yandex Embeddings API call.
	// This deterministic fallback enables dry-runs and pipeline validation.
	h := sha1.Sum([]byte(text))
	seed := hex.EncodeToString(h[:])
	out := make([]float32, embeddingDim)
	for i := range out {
		out[i] = float32(seed[i%len(seed)]) / 255.0
	}
	return out, nil
}

func vectorLiteral(v []float32) string {
	parts := make([]string, len(v))
	for i := range v {
		parts[i] = fmt.Sprintf("%.6f", v[i])
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func chunkMetaJSON(content string) string {
	return fmt.Sprintf(`{"sha1":"%x","chars":%d}`, sha1.Sum([]byte(content)), len(content))
}

func estimateTokenCount(content string) int {
	// Rough heuristic for RU/EN mixed text.
	return len([]rune(content)) / 4
}

var spaceRe = regexp.MustCompile(`\s+`)

func normalizeText(s string) string {
	s = strings.TrimSpace(s)
	s = spaceRe.ReplaceAllString(s, " ")
	return s
}
