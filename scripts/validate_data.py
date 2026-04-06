#!/usr/bin/env python3
"""Проверка целостности seed-данных перед импортом."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "seed"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def validate_ird() -> list[str]:
    errors: list[str] = []
    payload = load(SEED / "ird_data.json")
    for i, row in enumerate(payload.get("ird_documents", []), start=1):
        if row.get("doc_type") not in {"GPZU", "TZ", "MTZ", "TU"}:
            errors.append(f"ird_documents[{i}]: invalid doc_type")
    return errors


def validate_tep() -> list[str]:
    errors: list[str] = []
    payload = load(SEED / "tep_templates.json")
    codes: set[str] = set()
    for i, template in enumerate(payload.get("tep_templates", []), start=1):
        code = template.get("code")
        if not code:
            errors.append(f"tep_templates[{i}]: missing code")
            continue
        if code in codes:
            errors.append(f"tep_templates[{i}]: duplicate code {code}")
        codes.add(code)

        keys: set[str] = set()
        for ind in template.get("indicators", []):
            key = ind.get("key")
            if not key:
                errors.append(f"template {code}: indicator missing key")
                continue
            if key in keys:
                errors.append(f"template {code}: duplicate indicator key {key}")
            keys.add(key)
            for child in ind.get("sub_indicators", []):
                ckey = child.get("key")
                if not ckey:
                    errors.append(f"template {code}: child missing key under {key}")
                elif ckey in keys:
                    errors.append(f"template {code}: duplicate child key {ckey}")
                keys.add(ckey)
    return errors


def validate_project_structure() -> list[str]:
    errors: list[str] = []
    payload = load(SEED / "project_structure_p.json")

    volumes = payload.get("volumes") or []
    if not volumes:
        errors.append("project_structure_p: volumes is empty")
        return errors

    numbers: set[str] = set()
    for i, volume in enumerate(volumes, start=1):
        number = str(volume.get("volume_no", "")).strip()
        name = str(volume.get("name", "")).strip()
        if not number:
            errors.append(f"project_structure_p.volumes[{i}]: missing volume_no")
        if not name:
            errors.append(f"project_structure_p.volumes[{i}]: missing name")
        if number in numbers:
            errors.append(f"project_structure_p: duplicate volume_no {number}")
        numbers.add(number)

    return errors




def validate_ssr() -> list[str]:
    errors: list[str] = []
    payload = load(SEED / "ssr_template.json")
    if not payload.get("chapters"):
        errors.append("ssr_template: chapters is empty")
        return errors

    row_numbers: set[int] = set()
    for chapter in payload.get("chapters", []):
        for item in chapter.get("items", []):
            row_no = item.get("row_no")
            if row_no is None:
                errors.append(f"ssr_template: item without row_no in chapter {chapter.get('chapter_number')}")
                continue
            if row_no in row_numbers:
                errors.append(f"ssr_template: duplicate row_no {row_no}")
            row_numbers.add(row_no)
    return errors

def validate_schedule() -> list[str]:
    errors: list[str] = []
    payload = load(SEED / "schedule_sample.json")

    def walk(tasks: list[dict], prefix: str = "tasks") -> None:
        for idx, task in enumerate(tasks, start=1):
            path = f"{prefix}[{idx}]"
            if task.get("progress_pct", 0) < 0 or task.get("progress_pct", 0) > 100:
                errors.append(f"{path}: progress_pct out of range")
            if task.get("planned_start") and task.get("planned_end"):
                if task["planned_end"] < task["planned_start"]:
                    errors.append(f"{path}: planned_end before planned_start")
            walk(task.get("children", []), prefix=f"{path}.children")

    walk(payload.get("tasks", []))
    return errors


def validate_sdr_schedule() -> list[str]:
    errors: list[str] = []
    payload = load(SEED / "sdr_schedule_sample.json")
    rows = payload.get("rows", [])
    if not rows:
        errors.append("sdr_schedule_sample: rows is empty")
        return errors

    nums: set[str] = set()
    for i, row in enumerate(rows, start=1):
        num = str(row.get("num", "")).strip()
        task_name = str(row.get("task_name", "")).strip()
        if not num:
            errors.append(f"sdr_schedule_sample.rows[{i}]: missing num")
        if not task_name:
            errors.append(f"sdr_schedule_sample.rows[{i}]: missing task_name")
        if num in nums:
            errors.append(f"sdr_schedule_sample: duplicate num {num}")
        nums.add(num)
    return errors


def main() -> None:
    errors = []
    errors.extend(validate_ird())
    errors.extend(validate_tep())
    errors.extend(validate_project_structure())
    errors.extend(validate_ssr())
    errors.extend(validate_schedule())
    errors.extend(validate_sdr_schedule())

    if errors:
        print("Validation failed:")
        for err in errors:
            print(f" - {err}")
        raise SystemExit(1)

    print("All seed files are valid.")


if __name__ == "__main__":
    main()
