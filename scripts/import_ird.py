#!/usr/bin/env python3
"""Импорт ИРД из JSON в PostgreSQL."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values


SQL_INSERT = """
INSERT INTO ird_documents (
    project_id, doc_type, doc_number, issue_date, expiry_date,
    status, issuer, notes, file_path
)
VALUES %s
"""


def load_payload(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("ird_documents", [])


def main() -> None:
    parser = argparse.ArgumentParser(description="Import IRD JSON into DB")
    parser.add_argument("--dsn", required=True, help="PostgreSQL DSN")
    parser.add_argument("--project-id", required=True, help="Target project UUID")
    parser.add_argument("--file", default="seed/ird_data.json", help="Path to JSON")
    args = parser.parse_args()

    rows = load_payload(Path(args.file))
    if not rows:
        print("No IRD rows found.")
        return

    values = [
        (
            args.project_id,
            row["doc_type"],
            row.get("doc_number"),
            row.get("issue_date"),
            row.get("expiry_date"),
            row.get("status", "active"),
            row.get("issuer"),
            row.get("notes"),
            row.get("file_path"),
        )
        for row in rows
    ]

    with psycopg2.connect(args.dsn) as conn:
        with conn.cursor() as cur:
            execute_values(cur, SQL_INSERT, values)
        conn.commit()

    print(f"Imported {len(values)} IRD records.")


if __name__ == "__main__":
    main()
