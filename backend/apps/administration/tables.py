"""Reads an uploaded or fetched table (CSV or Excel) into rows of lower-cased column -> text."""

import csv
import io
import zipfile
from datetime import date, datetime, time

from django.core.exceptions import ValidationError

MAX_ROWS = 5000


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%H:%M") if value.date() == date(1899, 12, 30) else value.isoformat()
    if isinstance(value, time):
        return value.strftime("%H:%M")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))  # Excel stores 42 as 42.0
    return str(value).strip()


def _from_csv(raw: bytes) -> list[list[str]]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValidationError("Save the file as CSV UTF-8 and try again.") from None
    return [[c.strip() for c in row] for row in csv.reader(io.StringIO(text))]


def _from_xlsx(raw: bytes) -> list[list[str]]:
    from openpyxl import load_workbook
    from openpyxl.utils.exceptions import InvalidFileException

    try:
        book = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except (InvalidFileException, zipfile.BadZipFile, KeyError, OSError):
        raise ValidationError("That Excel file couldn't be read. Save it as .xlsx and try again.") \
            from None
    try:
        sheet = book.worksheets[0]
        rows = []
        for row in sheet.iter_rows(values_only=True):
            rows.append([_cell(v) for v in row])
            if len(rows) > MAX_ROWS + 1:
                break
        return rows
    finally:
        book.close()


def finish_plan(rows: list[dict], not_in_file: list[str], extra: dict | None = None) -> dict:
    statuses = ("new", "update", "unchanged", "error")
    counts = {s: sum(1 for r in rows if r["status"] == s) for s in statuses}
    return {
        "rows": rows,
        "summary": counts | (extra or {}) | {"rows": len(rows), "not_in_file": len(not_in_file)},
        "not_in_file": sorted(not_in_file)[:50],
    }


def read_table(raw: bytes, filename: str, required: list[str]) -> list[dict]:
    name = (filename or "").lower()
    if name.endswith(".xlsx"):
        grid = _from_xlsx(raw)
    elif name.endswith(".csv"):
        grid = _from_csv(raw)
    else:
        raise ValidationError("Upload a .csv or .xlsx file.")
    grid = [row for row in grid if any(cell for cell in row)]  # skip blank lines
    if not grid:
        raise ValidationError("The file is empty.")
    headers = [h.strip().lower().replace(" ", "_") for h in grid[0]]
    missing = [h for h in required if h not in headers]
    if missing:
        raise ValidationError(
            f"The file is missing these columns: {', '.join(missing)}. "
            "Download the template to see the expected layout."
        )
    rows = [
        {h: (row[i] if i < len(row) else "") for i, h in enumerate(headers) if h}
        for row in grid[1:]
    ]
    if not rows:
        raise ValidationError("The file has no rows.")
    if len(rows) > MAX_ROWS:
        raise ValidationError(f"Import up to {MAX_ROWS} rows at a time.")
    return rows
