#!/usr/bin/env python3
"""Импорт шаблона графика СДР/СМР в таблицу project_template_rows."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import psycopg2
from psycopg2.extras import Json


def main() -> None:
    parser = argparse.ArgumentParser(description="Import SDR schedule rows")
    parser.add_argument("--dsn", required=True, help="PostgreSQL DSN")
    parser.add_argument("--project-id", required=True, help="Target project UUID")
    parser.add_argument("--file", default="seed/sdr_schedule_sample.json", help="Path to SDR JSON")
    parser.add_argument("--template-code", default="smr_schedule", help="Template code")
    args = parser.parse_args()

    payload = json.loads(Path(args.file).read_text(encoding="utf-8"))
    rows = payload.get("rows", [])
    if not rows:
        print("No SDR rows found.")
        return

    with psycopg2.connect(args.dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM project_template_rows WHERE project_id = %s AND template_code = %s",
                (args.project_id, args.template_code),
            )
            for idx, row in enumerate(rows, start=1):
                cur.execute(
                    """
                    INSERT INTO project_template_rows (project_id, template_code, row_number, values_json)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (args.project_id, args.template_code, idx, Json(row)),
                )
        conn.commit()

    print(f"Imported {len(rows)} SDR rows.")


if __name__ == "__main__":
    main()
