#!/usr/bin/env python3
"""Импорт шаблонов ТЭП из JSON в PostgreSQL."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import psycopg2


def load_payload(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("tep_templates", [])


def insert_template(cur, template: dict[str, Any]) -> str:
    cur.execute(
        """
        INSERT INTO tep_templates (code, name, category, description)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (code) DO UPDATE
            SET name = EXCLUDED.name,
                category = EXCLUDED.category,
                description = EXCLUDED.description,
                updated_at = NOW()
        RETURNING id
        """,
        (
            template["code"],
            template["name"],
            template["category"],
            template.get("description"),
        ),
    )
    return cur.fetchone()[0]


def upsert_indicator(cur, template_id: str, ind: dict[str, Any], parent_key: str | None, order: int) -> None:
    cur.execute(
        """
        INSERT INTO tep_indicators (
            template_id, key, label, unit, required, calculation_method,
            parent_key, sort_order, metadata
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        ON CONFLICT (template_id, key) DO UPDATE
            SET label = EXCLUDED.label,
                unit = EXCLUDED.unit,
                required = EXCLUDED.required,
                calculation_method = EXCLUDED.calculation_method,
                parent_key = EXCLUDED.parent_key,
                sort_order = EXCLUDED.sort_order,
                metadata = EXCLUDED.metadata
        """,
        (
            template_id,
            ind["key"],
            ind["label"],
            ind.get("unit", "шт."),
            bool(ind.get("required", False)),
            ind.get("calculation", "manual"),
            parent_key,
            order,
            json.dumps({k: v for k, v in ind.items() if k not in {"key", "label", "unit", "required", "calculation", "sub_indicators"}}, ensure_ascii=False),
        ),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Import TEP templates")
    parser.add_argument("--dsn", required=True, help="PostgreSQL DSN")
    parser.add_argument("--file", default="seed/tep_templates.json", help="Path to JSON")
    args = parser.parse_args()

    templates = load_payload(Path(args.file))
    if not templates:
        print("No TEP templates found.")
        return

    with psycopg2.connect(args.dsn) as conn:
        with conn.cursor() as cur:
            for template in templates:
                template_id = insert_template(cur, template)
                for idx, indicator in enumerate(template.get("indicators", []), start=1):
                    upsert_indicator(cur, template_id, indicator, None, idx)
                    for sub_idx, child in enumerate(indicator.get("sub_indicators", []), start=1):
                        upsert_indicator(cur, template_id, child, indicator["key"], idx * 100 + sub_idx)
        conn.commit()

    print(f"Imported/updated {len(templates)} templates.")


if __name__ == "__main__":
    main()
